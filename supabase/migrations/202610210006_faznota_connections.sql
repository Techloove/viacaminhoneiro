-- Provider credentials are encrypted by Supabase Vault; only the Edge Function service role
-- may invoke the credential RPCs. Browser clients can read metadata, never tokens.
create extension if not exists supabase_vault with schema vault;
create schema if not exists via_fiscal_private;
revoke all on schema via_fiscal_private from public,anon,authenticated;
create table via_fiscal_private.faznota_credentials (
 organization_id uuid primary key references public.organizations(id),
 vault_secret_id uuid not null,
 generation uuid not null default gen_random_uuid()
);
alter table via_fiscal_private.faznota_credentials enable row level security;
revoke all on via_fiscal_private.faznota_credentials from public,anon,authenticated;
create table public.fiscal_connections (
 organization_id uuid primary key references public.organizations(id),
 provider text not null default 'faznota' check(provider='faznota'),
 declared_environment text not null default 'unconfirmed' check(declared_environment in ('unconfirmed','homologation','production')),
 credential_configured boolean not null default false,
 authentication_state text not null default 'unchecked' check(authentication_state in ('unchecked','authenticated','failed')),
 last_test_started_at timestamptz,
 last_checked_at timestamptz,
 api_version text,
 updated_at timestamptz not null default now()
);
create table public.fiscal_connection_events (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 actor_id uuid not null references auth.users(id),
 event text not null check(event in ('credential_saved','authentication_confirmed','authentication_unconfirmed','disconnected')),
 created_at timestamptz not null default now()
);
create index fiscal_connection_events_org on public.fiscal_connection_events(organization_id,created_at desc);
alter table public.fiscal_connections enable row level security;
alter table public.fiscal_connection_events enable row level security;
create policy connection_metadata_read on public.fiscal_connections for select to authenticated using(exists(select 1 from public.memberships m where m.organization_id=fiscal_connections.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator','viewer')));
create policy connection_events_read on public.fiscal_connection_events for select to authenticated using(exists(select 1 from public.memberships m where m.organization_id=fiscal_connection_events.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager')));
revoke all on public.fiscal_connections,public.fiscal_connection_events from anon,authenticated;
grant select on public.fiscal_connections,public.fiscal_connection_events to authenticated;

-- Central authorization hook; platform administration may extend this in migration 007.
create function public.faznota_actor_can_manage(p_organization_id uuid,p_actor_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships where organization_id=p_organization_id and user_id=p_actor_id and role in ('owner','manager'))
$$;
revoke all on function public.faznota_actor_can_manage(uuid,uuid) from public,anon,authenticated;
grant execute on function public.faznota_actor_can_manage(uuid,uuid) to service_role;
create function public.faznota_store_credential(p_organization_id uuid,p_actor_id uuid,p_token text,p_environment text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare secret_id uuid; result jsonb;
begin
 if not public.faznota_actor_can_manage(p_organization_id,p_actor_id) then raise exception 'Sem permissão.' using errcode='42501'; end if;
 if p_token is null or length(p_token) not between 8 and 4096 or p_token ~ '[[:space:][:cntrl:]]' or p_environment is null or p_environment not in ('unconfirmed','homologation','production') then raise exception 'Configuração inválida.' using errcode='22023'; end if;
 perform id from public.organizations where id=p_organization_id for update;
 select vault_secret_id into secret_id from via_fiscal_private.faznota_credentials where organization_id=p_organization_id;
 if secret_id is null then
  select vault.create_secret(p_token) into secret_id;
  insert into via_fiscal_private.faznota_credentials(organization_id,vault_secret_id) values(p_organization_id,secret_id);
 else
  perform vault.update_secret(secret_id,p_token);
  update via_fiscal_private.faznota_credentials set generation=gen_random_uuid() where organization_id=p_organization_id;
 end if;
 insert into public.fiscal_connections(organization_id,declared_environment,credential_configured) values(p_organization_id,p_environment,true)
 on conflict(organization_id) do update set declared_environment=excluded.declared_environment,credential_configured=true,authentication_state='unchecked',last_test_started_at=null,last_checked_at=null,api_version=null,updated_at=now();
 insert into public.fiscal_connection_events(organization_id,actor_id,event) values(p_organization_id,p_actor_id,'credential_saved');
 select to_jsonb(c) into result from public.fiscal_connections c where organization_id=p_organization_id; return result;
end;
$$;
create function public.faznota_begin_auth_check(p_organization_id uuid,p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cred via_fiscal_private.faznota_credentials; started timestamptz; token text;
begin
 if not public.faznota_actor_can_manage(p_organization_id,p_actor_id) then raise exception 'Sem permissão.' using errcode='42501'; end if;
 perform id from public.organizations where id=p_organization_id for update;
 select * into cred from via_fiscal_private.faznota_credentials where organization_id=p_organization_id;
 if cred.organization_id is null then raise exception 'Credencial não configurada.' using errcode='22023'; end if;
 select last_test_started_at into started from public.fiscal_connections where organization_id=p_organization_id;
 if started > now()-interval '15 seconds' then raise exception 'Aguarde antes de testar novamente.' using errcode='P0001'; end if;
 select decrypted_secret into token from vault.decrypted_secrets where id=cred.vault_secret_id;
 if token is null then raise exception 'Credencial indisponível.' using errcode='22023'; end if;
 update public.fiscal_connections set last_test_started_at=now() where organization_id=p_organization_id;
 return jsonb_build_object('token',token,'generation',cred.generation);
end;
$$;
create function public.faznota_record_auth_check(p_organization_id uuid,p_actor_id uuid,p_generation uuid,p_success boolean,p_api_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.faznota_actor_can_manage(p_organization_id,p_actor_id) then raise exception 'Sem permissão.' using errcode='42501'; end if;
 perform id from public.organizations where id=p_organization_id for update;
 if not exists(select 1 from via_fiscal_private.faznota_credentials where organization_id=p_organization_id and generation=p_generation) then raise exception 'Credencial alterada. Refaça o teste.' using errcode='40001'; end if;
 if p_success is null or (p_api_version is not null and p_api_version !~ '^[0-9]{1,3}[.][0-9]{1,3}[.][0-9]{1,3}$') then raise exception 'Resultado inválido.' using errcode='22023'; end if;
 update public.fiscal_connections set authentication_state=case when p_success then 'authenticated' else 'failed' end,last_checked_at=now(),api_version=p_api_version,updated_at=now() where organization_id=p_organization_id;
 insert into public.fiscal_connection_events(organization_id,actor_id,event) values(p_organization_id,p_actor_id,case when p_success then 'authentication_confirmed' else 'authentication_unconfirmed' end);
 select to_jsonb(c) into result from public.fiscal_connections c where organization_id=p_organization_id; return result;
end;
$$;
create function public.faznota_disconnect(p_organization_id uuid,p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare secret_id uuid;
begin
 if not public.faznota_actor_can_manage(p_organization_id,p_actor_id) then raise exception 'Sem permissão.' using errcode='42501'; end if;
 perform id from public.organizations where id=p_organization_id for update;
 select vault_secret_id into secret_id from via_fiscal_private.faznota_credentials where organization_id=p_organization_id;
 delete from via_fiscal_private.faznota_credentials where organization_id=p_organization_id;
 if secret_id is not null then delete from vault.secrets where id=secret_id; end if;
 update public.fiscal_connections set credential_configured=false,authentication_state='unchecked',last_checked_at=null,last_test_started_at=null,api_version=null,updated_at=now() where organization_id=p_organization_id;
 insert into public.fiscal_connection_events(organization_id,actor_id,event) values(p_organization_id,p_actor_id,'disconnected');
 return jsonb_build_object('disconnected',true);
end;
$$;
revoke all on function public.faznota_store_credential(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.faznota_begin_auth_check(uuid,uuid) from public,anon,authenticated;
revoke all on function public.faznota_record_auth_check(uuid,uuid,uuid,boolean,text) from public,anon,authenticated;
revoke all on function public.faznota_disconnect(uuid,uuid) from public,anon,authenticated;
grant execute on function public.faznota_store_credential(uuid,uuid,text,text) to service_role;
grant execute on function public.faznota_begin_auth_check(uuid,uuid) to service_role;
grant execute on function public.faznota_record_auth_check(uuid,uuid,uuid,boolean,text) to service_role;
grant execute on function public.faznota_disconnect(uuid,uuid) to service_role;
