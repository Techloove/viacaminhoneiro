-- Preparatory information only. No fiscal authorization can be recorded through this API.
create table public.freight_drafts (
 id uuid primary key,
 organization_id uuid not null references public.organizations(id),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=65536),
 current_step integer not null default 0 check(current_step between 0 and 4),
 revision integer not null default 1 check(revision>0),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index freight_drafts_org_updated on public.freight_drafts(organization_id,updated_at desc);
alter table public.freight_drafts enable row level security;
create policy freight_drafts_read on public.freight_drafts for select to authenticated using(exists(select 1 from public.memberships m where m.organization_id=freight_drafts.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator','viewer')));
revoke all on public.freight_drafts from anon,authenticated;
grant select on public.freight_drafts to authenticated;
-- Only this function writes drafts. Optimistic revision checking prevents silent overwrites.
create function public.save_freight_draft(p_id uuid,p_organization_id uuid,p_payload jsonb,p_current_step integer,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.freight_drafts;
begin
 if auth.uid() is null or not exists(select 1 from public.memberships m where m.organization_id=p_organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator')) then
  raise exception 'Sem permissão para salvar nesta transportadora.' using errcode='42501';
 end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>65536 or p_current_step is null or p_current_step not between 0 and 4 or p_expected_revision is null or p_expected_revision<0 then
  raise exception 'Rascunho inválido.' using errcode='22023';
 end if;
 if p_expected_revision=0 then
  insert into public.freight_drafts(id,organization_id,payload,current_step,created_by)
  values(p_id,p_organization_id,p_payload,p_current_step,auth.uid()) on conflict(id) do nothing returning * into saved;
 else
  update public.freight_drafts set payload=p_payload,current_step=p_current_step,revision=revision+1,updated_at=now()
  where id=p_id and organization_id=p_organization_id and revision=p_expected_revision returning * into saved;
 end if;
 if saved.id is null then raise exception 'Rascunho alterado em outra sessão. Reabra a versão salva antes de continuar.' using errcode='40001'; end if;
 return to_jsonb(saved);
end;
$$;
revoke all on function public.save_freight_draft(uuid,uuid,jsonb,integer,integer) from public,anon;
grant execute on function public.save_freight_draft(uuid,uuid,jsonb,integer,integer) to authenticated;
