-- Apply to a Supabase project using migrations. No fiscal credentials belong here.
create table public.organizations (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(trim(name)) between 1 and 160),
 created_at timestamptz not null default now()
);
create table public.memberships (
 organization_id uuid not null references public.organizations(id),
 user_id uuid not null references auth.users(id),
 role text not null check (role in ('owner','manager','operator','driver','viewer')),
 primary key (organization_id,user_id)
);
create table public.trips (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 origin text not null check (length(trim(origin)) between 1 and 120),
 destination text not null check (length(trim(destination)) between 1 and 120),
 driver text not null check (length(trim(driver)) between 1 and 120),
 plate text not null check (plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
 freight_cents bigint not null check (freight_cents between 0 and 10000000000),
 status text not null default 'draft' check (status = 'draft'),
 created_at timestamptz not null default now()
);
create index trips_organization_created on public.trips(organization_id,created_at desc);
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.trips enable row level security;
create policy memberships_read_self on public.memberships for select to authenticated using (user_id=auth.uid());
create policy organizations_read_member on public.organizations for select to authenticated using (exists(select 1 from public.memberships m where m.organization_id=id and m.user_id=auth.uid()));
create policy trips_read_operator on public.trips for select to authenticated using (exists(select 1 from public.memberships m where m.organization_id=trips.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator','viewer')));
create policy trips_insert_operator on public.trips for insert to authenticated with check (exists(select 1 from public.memberships m where m.organization_id=trips.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator')));
-- Membership mutations are intentionally not available to the browser.
create function public.create_organization(organization_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare org_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if length(trim(organization_name)) not between 1 and 160 then raise exception 'Invalid organization name'; end if;
 insert into public.organizations(name) values(trim(organization_name)) returning id into org_id;
 insert into public.memberships(organization_id,user_id,role) values(org_id,auth.uid(),'owner');
 return org_id;
end;
$$;
revoke all on function public.create_organization(text) from public, anon;
grant execute on function public.create_organization(text) to authenticated;
grant select on public.organizations,public.memberships to authenticated;
grant select,insert on public.trips to authenticated;
