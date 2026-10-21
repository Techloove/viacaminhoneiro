-- Operational registries. No RNTRC/driver-license verification against external services.
create function public.registry_valid_cpf(p_value text) returns boolean
language plpgsql immutable set search_path='' as $$
declare total integer; digit integer; pos integer; check_pos integer;
begin
 if p_value is null or p_value !~ '^[0-9]{11}$' or p_value = repeat(substring(p_value,1,1),11) then return false; end if;
 for check_pos in 10..11 loop
  total:=0;
  for pos in 1..check_pos-1 loop total:=total+substring(p_value,pos,1)::integer*(check_pos+1-pos); end loop;
  digit:=(total*10)%11; if digit=10 then digit:=0; end if;
  if digit<>substring(p_value,check_pos,1)::integer then return false; end if;
 end loop;
 return true;
end;
$$;
create table public.carrier_drivers (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 name text not null check(length(trim(name)) between 1 and 120),
 cpf text not null check(public.registry_valid_cpf(cpf)),
 license_number text not null default '' check(license_number='' or license_number ~ '^[0-9]{11}$'),
 license_expiry date,
 phone text not null default '' check(length(phone)<=30),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,cpf)
);
create table public.carrier_vehicles (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 plate text not null check(plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
 kind text not null check(kind in ('truck','tractor','trailer')),
 axles integer not null check(axles between 1 and 10),
 rntrc text not null default '' check(rntrc='' or rntrc ~ '^[0-9]{9}$'),
 owner_name text not null default '' check(length(owner_name)<=160),
 owner_document text not null default '' check(owner_document='' or owner_document ~ '^([0-9]{11}|[0-9]{14})$'),
 description text not null default '' check(length(description)<=160),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,plate)
);
create function public.stamp_carrier_registry() returns trigger language plpgsql set search_path='' as $$
begin
 if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id then
  raise exception 'Não é permitido transferir um cadastro para outra transportadora.' using errcode='42501';
 end if;
 new.created_at:=old.created_at; new.updated_at:=now(); return new;
end;
$$;
create trigger stamp_driver before update on public.carrier_drivers for each row execute function public.stamp_carrier_registry();
create trigger stamp_vehicle before update on public.carrier_vehicles for each row execute function public.stamp_carrier_registry();
alter table public.carrier_drivers enable row level security;
alter table public.carrier_vehicles enable row level security;
create policy driver_read on public.carrier_drivers for select to authenticated using(exists(select 1 from public.memberships m where m.organization_id=carrier_drivers.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator','viewer')));
create policy driver_insert on public.carrier_drivers for insert to authenticated with check(exists(select 1 from public.memberships m where m.organization_id=carrier_drivers.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator')));
create policy driver_update on public.carrier_drivers for update to authenticated using(exists(select 1 from public.memberships m where m.organization_id=carrier_drivers.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator'))) with check(exists(select 1 from public.memberships m where m.organization_id=carrier_drivers.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator')));
create policy vehicle_read on public.carrier_vehicles for select to authenticated using(exists(select 1 from public.memberships m where m.organization_id=carrier_vehicles.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator','viewer')));
create policy vehicle_insert on public.carrier_vehicles for insert to authenticated with check(exists(select 1 from public.memberships m where m.organization_id=carrier_vehicles.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator')));
create policy vehicle_update on public.carrier_vehicles for update to authenticated using(exists(select 1 from public.memberships m where m.organization_id=carrier_vehicles.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator'))) with check(exists(select 1 from public.memberships m where m.organization_id=carrier_vehicles.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator')));
revoke all on public.carrier_drivers,public.carrier_vehicles from anon,authenticated;
grant select,insert,update on public.carrier_drivers,public.carrier_vehicles to authenticated;
