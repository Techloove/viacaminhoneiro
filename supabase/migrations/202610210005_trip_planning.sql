-- Convert a saved preparation to an immutable planning snapshot, never to a fiscal authorization.
alter table public.trips add constraint trips_org_id_unique unique(organization_id,id);
alter table public.freight_drafts add constraint freight_drafts_org_id_unique unique(organization_id,id);
create table public.trip_plans (
 trip_id uuid primary key,
 organization_id uuid not null,
 draft_id uuid not null,
 source_revision integer not null check(source_revision>0),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(organization_id,draft_id),
 foreign key(organization_id,trip_id) references public.trips(organization_id,id),
 foreign key(organization_id,draft_id) references public.freight_drafts(organization_id,id)
);
alter table public.trip_plans enable row level security;
create policy trip_plan_read on public.trip_plans for select to authenticated using(exists(select 1 from public.memberships m where m.organization_id=trip_plans.organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator','viewer')));
revoke all on public.trip_plans from anon,authenticated;
grant select on public.trip_plans to authenticated;
create function public.create_trip_from_draft(p_draft_id uuid,p_organization_id uuid,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.freight_drafts; plan public.trip_plans; new_trip uuid; amount numeric; fields text[]:=array['origin','destination','driver']; field_name text;
begin
 if auth.uid() is null or not exists(select 1 from public.memberships m where m.organization_id=p_organization_id and m.user_id=auth.uid() and m.role in ('owner','manager','operator')) then
  raise exception 'Sem permissão para criar viagens nesta transportadora.' using errcode='42501';
 end if;
 -- Serialize conversion with another conversion or save of the same draft.
 select * into d from public.freight_drafts where id=p_draft_id and organization_id=p_organization_id for update;
 if d.id is null then raise exception 'Rascunho não encontrado nesta transportadora.' using errcode='42501'; end if;
 select * into plan from public.trip_plans where organization_id=p_organization_id and draft_id=p_draft_id;
 if plan.trip_id is not null then
  return jsonb_build_object('trip_id',plan.trip_id,'created',false,'source_revision',plan.source_revision);
 end if;
 if p_expected_revision is null or d.revision<>p_expected_revision then
  raise exception 'Rascunho alterado em outra sessão. Reabra a versão salva antes de criar a viagem.' using errcode='40001';
 end if;
 foreach field_name in array fields loop
  if length(trim(coalesce(d.payload->>field_name,''))) not between 1 and 120 then
   raise exception 'Preencha origem, destino e motorista antes de criar a viagem.' using errcode='22023';
  end if;
 end loop;
 if coalesce(d.payload->>'plate','') !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then raise exception 'Confira a placa do veículo.' using errcode='22023'; end if;
 if coalesce(d.payload->>'freight','') !~ '^[0-9]{1,9}([.][0-9]{1,2})?$' then raise exception 'Informe o frete em reais com até duas casas decimais.' using errcode='22023'; end if;
 amount:=(d.payload->>'freight')::numeric;
 if amount<=0 or amount>100000000 then raise exception 'Informe um frete positivo de até R$ 100.000.000,00.' using errcode='22023'; end if;
 insert into public.trips(organization_id,origin,destination,driver,plate,freight_cents,status)
 values(p_organization_id,trim(d.payload->>'origin'),trim(d.payload->>'destination'),trim(d.payload->>'driver'),d.payload->>'plate',(amount*100)::bigint,'draft') returning id into new_trip;
 insert into public.trip_plans(trip_id,organization_id,draft_id,source_revision,payload,created_by)
 values(new_trip,p_organization_id,p_draft_id,d.revision,d.payload,auth.uid());
 return jsonb_build_object('trip_id',new_trip,'created',true,'source_revision',d.revision);
end;
$$;
revoke all on function public.create_trip_from_draft(uuid,uuid,integer) from public,anon;
grant execute on function public.create_trip_from_draft(uuid,uuid,integer) to authenticated;
