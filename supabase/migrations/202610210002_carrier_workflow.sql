-- Carrier SaaS foundation. External confirmation tables are read-only to browser clients.
create table public.carrier_profiles (
 organization_id uuid primary key references public.organizations(id),
 name text not null check(length(trim(name)) between 1 and 160),
 cnpj text not null check(cnpj ~ '^[0-9]{14}$'),
 rntrc text not null default '' check(rntrc = '' or rntrc ~ '^[0-9]{9}$'),
 state_registration text not null default '',
 email text not null default ''
);
alter table public.carrier_profiles enable row level security;
create policy carrier_read on public.carrier_profiles for select to authenticated using(exists(select 1 from public.memberships m where m.organization_id=carrier_profiles.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator','viewer')));
create policy carrier_insert on public.carrier_profiles for insert to authenticated with check(exists(select 1 from public.memberships m where m.organization_id=carrier_profiles.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager')));
create policy carrier_update on public.carrier_profiles for update to authenticated using(exists(select 1 from public.memberships m where m.organization_id=carrier_profiles.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager'))) with check(exists(select 1 from public.memberships m where m.organization_id=carrier_profiles.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager')));
grant select,insert,update on public.carrier_profiles to authenticated;

create table public.received_invoices (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 access_key text not null check(access_key ~ '^[0-9]{44}$'),
 issuer_name text not null,
 carrier_cnpj text check(carrier_cnpj ~ '^[0-9]{14}$'),
 source text not null check(source in ('manual_xml','authorized_distribution')),
 verification_state text not null default 'unverified' check(verification_state in ('unverified','confirmed','rejected')),
 received_at timestamptz not null default now(),
 unique(organization_id,access_key), unique(organization_id,id)
);
create table public.freight_operations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 reference text not null,
 invoice_id uuid not null,
 created_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,reference),
 foreign key(organization_id,invoice_id) references public.received_invoices(organization_id,id)
);
create table public.operation_documents (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 operation_id uuid not null,
 kind text not null check(kind in ('cte','ciot','mdfe')),
 state text not null check(state in ('draft','pending','confirmed','rejected','cancelled','closed','uncertain')),
 environment text not null check(environment in ('homologation','production')),
 external_reference text,
 protocol text,
 confirmed_at timestamptz,
 unique(organization_id,id),
 foreign key(organization_id,operation_id) references public.freight_operations(organization_id,id),
 check(state <> 'confirmed' or (external_reference is not null and protocol is not null and confirmed_at is not null))
);
-- No INSERT/UPDATE/DELETE policies: only a separately authorized backend may populate these tables.
alter table public.received_invoices enable row level security;
alter table public.freight_operations enable row level security;
alter table public.operation_documents enable row level security;
create policy invoice_read on public.received_invoices for select to authenticated using(exists(select 1 from public.memberships m where m.organization_id=received_invoices.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator','viewer')));
create policy operation_read on public.freight_operations for select to authenticated using(exists(select 1 from public.memberships m where m.organization_id=freight_operations.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator','viewer')));
create policy document_read on public.operation_documents for select to authenticated using(exists(select 1 from public.memberships m where m.organization_id=operation_documents.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator','viewer')));
grant select on public.received_invoices,public.freight_operations,public.operation_documents to authenticated;
create index invoice_org_received on public.received_invoices(organization_id,received_at desc);
create index operation_org_invoice on public.freight_operations(organization_id,invoice_id);
create index document_org_operation on public.operation_documents(organization_id,operation_id);
-- NSU checkpoints, certificate custody, notification delivery and provider jobs require server integration.
