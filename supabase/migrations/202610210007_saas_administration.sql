-- Platform administration is separate from tenant ownership. No user is promoted automatically.
create schema if not exists via_platform_private;
revoke all on schema via_platform_private from public,anon,authenticated;
create table via_platform_private.admins(user_id uuid primary key references auth.users(id),active boolean not null default true,created_at timestamptz not null default now());
alter table via_platform_private.admins enable row level security;
revoke all on via_platform_private.admins from public,anon,authenticated;
create function public.is_platform_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from via_platform_private.admins where user_id=auth.uid() and active)$$;
revoke all on function public.is_platform_admin() from public,anon;
grant execute on function public.is_platform_admin() to authenticated;
create table public.tenant_subscriptions (
 organization_id uuid primary key references public.organizations(id),
 plan_name text not null default 'Personalizado' check(length(trim(plan_name)) between 1 and 100),
 status text not null default 'paused' check(status in ('active','paused','overdue','cancelled')),
 monthly_fee_cents bigint not null default 0 check(monthly_fee_cents between 0 and 10000000000),
 due_day integer not null default 5 check(due_day between 1 and 28),
 limit_cte integer check(limit_cte between 0 and 1000000),
 limit_ciot integer check(limit_ciot between 0 and 1000000),
 limit_mdfe integer check(limit_mdfe between 0 and 1000000),
 updated_at timestamptz not null default now()
);
create table public.document_quota_reservations (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 document_type text not null check(document_type in ('cte','ciot','mdfe')),operation_key uuid not null,
 period date not null,state text not null default 'reserved' check(state in ('reserved','confirmed','released')),
 created_at timestamptz not null default now(),unique(organization_id,document_type,operation_key)
);
create index document_quota_org_period on public.document_quota_reservations(organization_id,period,document_type,state);
create table via_platform_private.events(id uuid primary key default gen_random_uuid(),actor_id uuid not null references auth.users(id),organization_id uuid references public.organizations(id),event text not null,created_at timestamptz not null default now());
alter table via_platform_private.events enable row level security;
revoke all on via_platform_private.events from public,anon,authenticated;
alter table public.tenant_subscriptions enable row level security;
alter table public.document_quota_reservations enable row level security;
revoke all on public.tenant_subscriptions,public.document_quota_reservations from anon,authenticated;
grant select on public.tenant_subscriptions,public.document_quota_reservations to authenticated;
create policy subscription_read on public.tenant_subscriptions for select to authenticated using(public.is_platform_admin() or exists(select 1 from public.memberships m where m.organization_id=tenant_subscriptions.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator','viewer')));
create policy quota_read on public.document_quota_reservations for select to authenticated using(public.is_platform_admin() or exists(select 1 from public.memberships m where m.organization_id=document_quota_reservations.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator','viewer')));
-- Platform admins can manage fiscal credentials without being members of client operations.
-- They do NOT receive blanket access to customers, drivers, trips or documents.
create or replace function public.faznota_actor_can_manage(p_organization_id uuid,p_actor_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships where organization_id=p_organization_id and user_id=p_actor_id and role in ('owner','manager')) or exists(select 1 from via_platform_private.admins where user_id=p_actor_id and active)
$$;
create policy platform_connection_metadata on public.fiscal_connections for select to authenticated using(public.is_platform_admin());
create policy platform_connection_events on public.fiscal_connection_events for select to authenticated using(public.is_platform_admin());

create function public.platform_list_companies() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_platform_admin() then raise exception 'Administração da plataforma restrita.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(row_to_json(t) order by t.name),'[]'::jsonb) into result from (
 select o.id,o.name,p.cnpj,p.rntrc,s.plan_name,s.status,s.monthly_fee_cents,s.due_day,s.limit_cte,s.limit_ciot,s.limit_mdfe,
 (select count(*) from public.memberships m where m.organization_id=o.id) as user_count,
 (select count(*) from public.document_quota_reservations q where q.organization_id=o.id and q.document_type='cte' and q.period=date_trunc('month',timezone('America/Sao_Paulo',now()))::date and q.state in ('reserved','confirmed')) as used_cte,
 (select count(*) from public.document_quota_reservations q where q.organization_id=o.id and q.document_type='ciot' and q.period=date_trunc('month',timezone('America/Sao_Paulo',now()))::date and q.state in ('reserved','confirmed')) as used_ciot,
 (select count(*) from public.document_quota_reservations q where q.organization_id=o.id and q.document_type='mdfe' and q.period=date_trunc('month',timezone('America/Sao_Paulo',now()))::date and q.state in ('reserved','confirmed')) as used_mdfe
 from public.organizations o left join public.carrier_profiles p on p.organization_id=o.id left join public.tenant_subscriptions s on s.organization_id=o.id
 ) t;
 return result;
end;
$$;
create function public.platform_save_company(p_organization_id uuid,p_name text,p_cnpj text,p_owner_email text,p_plan_name text,p_status text,p_fee_cents bigint,p_due_day integer,p_limit_cte integer,p_limit_ciot integer,p_limit_mdfe integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid; owner_id uuid;
begin
 if not public.is_platform_admin() then raise exception 'Administração da plataforma restrita.' using errcode='42501'; end if;
 if length(trim(coalesce(p_name,''))) not between 1 and 160 or coalesce(p_cnpj,'') !~ '^[0-9]{14}$' or length(trim(coalesce(p_plan_name,''))) not between 1 and 100 then raise exception 'Confira nome, CNPJ e plano.' using errcode='22023'; end if;
 if nullif(trim(p_owner_email),'') is not null then
  select id into owner_id from auth.users where lower(email)=lower(trim(p_owner_email)) limit 1;
  if owner_id is null then raise exception 'O e-mail responsável precisa ter usuário cadastrado no Supabase Auth.' using errcode='22023'; end if;
 end if;
 if p_organization_id is null then insert into public.organizations(name) values(trim(p_name)) returning id into org;
 else update public.organizations set name=trim(p_name) where id=p_organization_id returning id into org;
  if org is null then raise exception 'Empresa não encontrada.' using errcode='22023'; end if;
 end if;
 insert into public.carrier_profiles(organization_id,name,cnpj) values(org,trim(p_name),p_cnpj) on conflict(organization_id) do update set name=excluded.name,cnpj=excluded.cnpj;
 insert into public.tenant_subscriptions(organization_id,plan_name,status,monthly_fee_cents,due_day,limit_cte,limit_ciot,limit_mdfe)
 values(org,trim(p_plan_name),p_status,p_fee_cents,p_due_day,p_limit_cte,p_limit_ciot,p_limit_mdfe)
 on conflict(organization_id) do update set plan_name=excluded.plan_name,status=excluded.status,monthly_fee_cents=excluded.monthly_fee_cents,due_day=excluded.due_day,limit_cte=excluded.limit_cte,limit_ciot=excluded.limit_ciot,limit_mdfe=excluded.limit_mdfe,updated_at=now();
 if owner_id is not null then insert into public.memberships(organization_id,user_id,role) values(org,owner_id,'owner') on conflict(organization_id,user_id) do update set role='owner'; end if;
 insert into via_platform_private.events(actor_id,organization_id,event) values(auth.uid(),org,'company_configuration_saved');
 return org;
end;
$$;
-- Only future trusted fiscal workers reserve/confirm/release usage. No browser can spend quota.
create function public.platform_reserve_document(p_organization_id uuid,p_actor_id uuid,p_document_type text,p_operation_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sub public.tenant_subscriptions; previous public.document_quota_reservations; lim integer; used bigint; reservation uuid; month_start date:=date_trunc('month',timezone('America/Sao_Paulo',now()))::date;
begin
 if not exists(select 1 from public.memberships where organization_id=p_organization_id and user_id=p_actor_id and role in ('owner','manager','operator')) then raise exception 'Sem permissão para emitir nesta empresa.' using errcode='42501'; end if;
 if p_document_type is null or p_document_type not in ('cte','ciot','mdfe') or p_operation_key is null then raise exception 'Operação inválida.' using errcode='22023'; end if;
 select * into sub from public.tenant_subscriptions where organization_id=p_organization_id for update;
 if sub.organization_id is null then raise exception 'Assinatura não configurada.' using errcode='22023'; end if;
 select * into previous from public.document_quota_reservations where organization_id=p_organization_id and document_type=p_document_type and operation_key=p_operation_key;
 if previous.id is not null then return jsonb_build_object('reservation_id',previous.id,'state',previous.state,'reused',true); end if;
 if sub.status<>'active' then raise exception 'Assinatura não está ativa para novas emissões.' using errcode='22023'; end if;
 lim:=case p_document_type when 'cte' then sub.limit_cte when 'ciot' then sub.limit_ciot else sub.limit_mdfe end;
 select count(*) into used from public.document_quota_reservations where organization_id=p_organization_id and period=month_start and document_type=p_document_type and state in ('reserved','confirmed');
 if lim is not null and used>=lim then raise exception 'Limite mensal atingido.' using errcode='P0001'; end if;
 insert into public.document_quota_reservations(organization_id,document_type,operation_key,period) values(p_organization_id,p_document_type,p_operation_key,month_start) returning id into reservation;
 return jsonb_build_object('reservation_id',reservation,'state','reserved','reused',false);
end;
$$;
create function public.platform_complete_document(p_organization_id uuid,p_reservation_id uuid,p_confirmed boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_confirmed is null then raise exception 'Resultado inválido.' using errcode='22023'; end if;
 update public.document_quota_reservations set state=case when p_confirmed then 'confirmed' else 'released' end where organization_id=p_organization_id and id=p_reservation_id and state='reserved';
end;
$$;
revoke all on function public.platform_list_companies() from public,anon;
revoke all on function public.platform_save_company(uuid,text,text,text,text,text,bigint,integer,integer,integer,integer) from public,anon;
grant execute on function public.platform_list_companies() to authenticated;
grant execute on function public.platform_save_company(uuid,text,text,text,text,text,bigint,integer,integer,integer,integer) to authenticated;
revoke all on function public.platform_reserve_document(uuid,uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.platform_complete_document(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.platform_reserve_document(uuid,uuid,text,uuid) to service_role;
grant execute on function public.platform_complete_document(uuid,uuid,boolean) to service_role;

-- Each carrier owns its customer base. Platform administration alone does not grant access.
create table public.carrier_customers (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 name text not null check(length(trim(name)) between 1 and 160),
 document text not null check((length(document)=11 and public.registry_valid_cpf(document)) or document ~ '^[0-9]{14}$'),
 email text not null default '' check(length(email)<=254),phone text not null default '' check(length(phone)<=30),
 zip_code text not null default '' check(zip_code='' or zip_code ~ '^[0-9]{8}$'),
 street text not null default '' check(length(street)<=160),address_number text not null default '' check(length(address_number)<=30),
 district text not null default '' check(length(district)<=120),city text not null default '' check(length(city)<=120),
 state text not null default '' check(state='' or state in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
 ibge_code text not null default '' check(ibge_code='' or ibge_code ~ '^[0-9]{7}$'),
 active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,document)
);
create trigger stamp_customer before update on public.carrier_customers for each row execute function public.stamp_carrier_registry();
alter table public.carrier_customers enable row level security;
revoke all on public.carrier_customers from anon,authenticated;
grant select,insert,update on public.carrier_customers to authenticated;
create policy customer_read on public.carrier_customers for select to authenticated using(exists(select 1 from public.memberships m where m.organization_id=carrier_customers.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator','viewer')));
create policy customer_insert on public.carrier_customers for insert to authenticated with check(exists(select 1 from public.memberships m where m.organization_id=carrier_customers.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator')));
create policy customer_update on public.carrier_customers for update to authenticated using(exists(select 1 from public.memberships m where m.organization_id=carrier_customers.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator'))) with check(exists(select 1 from public.memberships m where m.organization_id=carrier_customers.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator')));
