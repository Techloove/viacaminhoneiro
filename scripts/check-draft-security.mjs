import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(
  `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`,
);
for (const name of [
  "202610210001_initial.sql",
  "202610210002_carrier_workflow.sql",
  "202610210003_freight_drafts.sql",
  "202610210004_fleet_registry.sql",
  "202610210005_trip_planning.sql",
])
  await db.exec(readFileSync(new URL("../supabase/migrations/" + name, import.meta.url), "utf8"));
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  v = "33333333-3333-4333-8333-333333333333";
const oa = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ob = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  draft = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
await db.query(`insert into auth.users values ($1),($2),($3)`, [a, b, v]);
await db.query(
  `insert into public.organizations(id,name) values($1,'Transportadora A'),($2,'Transportadora B')`,
  [oa, ob],
);
await db.query(
  `insert into public.memberships values($1,$2,'owner'),($3,$4,'owner'),($1,$5,'viewer')`,
  [oa, a, ob, b, v],
);
async function asUser(id) {
  await db.exec("reset role; set role authenticated;");
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [id]);
}
async function rejects(fn, code) {
  try {
    await fn();
    throw new Error("Expected rejection");
  } catch (e) {
    assert.equal(e.code, code);
  }
}
const save = (org, rev, payload = { reference: "TESTE" }) =>
  db.query(`select public.save_freight_draft($1,$2,$3,0,$4) as saved`, [
    draft,
    org,
    JSON.stringify(payload),
    rev,
  ]);
await asUser(a);
assert.equal((await save(oa, 0, {})).rows[0].saved.revision, 1);
assert.equal((await save(oa, 1)).rows[0].saved.revision, 2);
await rejects(() => save(oa, 1), "40001");
assert.equal((await db.query("select revision from public.freight_drafts")).rows[0].revision, 2);
await rejects(() => db.query(`update public.freight_drafts set revision=99`), "42501");
await asUser(b);
assert.equal((await db.query("select * from public.freight_drafts")).rows.length, 0);
await rejects(() => save(oa, 2), "42501");
await rejects(() => save(ob, 2), "40001");
await asUser(v);
assert.equal((await db.query("select * from public.freight_drafts")).rows.length, 1);
await rejects(() => save(oa, 2), "42501");
await db.exec("reset role; set role anon;");
await rejects(() => db.query("select * from public.freight_drafts"), "42501");
await rejects(() => save(oa, 2), "42501");
await asUser(a);
await rejects(() => save(oa, 2, { large: "x".repeat(66000) }), "22023");

// Registry policies: two independent tenant owners and a read-only viewer.
await asUser(a);
const driverA = (
  await db.query(
    `insert into public.carrier_drivers(organization_id,name,cpf) values($1,'Motorista A','52998224725') returning id`,
    [oa],
  )
).rows[0].id;
const vehicleA = (
  await db.query(
    `insert into public.carrier_vehicles(organization_id,plate,kind,axles) values($1,'ABC1D23','truck',3) returning id`,
    [oa],
  )
).rows[0].id;
await rejects(
  () =>
    db.query(
      `insert into public.carrier_drivers(organization_id,name,cpf) values($1,'CPF inválido','52998224726')`,
      [oa],
    ),
  "23514",
);
await rejects(
  () =>
    db.query(
      `insert into public.carrier_drivers(organization_id,name,cpf) values($1,'Duplicado','52998224725')`,
      [oa],
    ),
  "23505",
);
await asUser(b);
for (const table of ["carrier_drivers", "carrier_vehicles"])
  assert.equal((await db.query("select * from public." + table)).rows.length, 0);
await rejects(
  () =>
    db.query(
      `insert into public.carrier_drivers(organization_id,name,cpf) values($1,'Intruso','52998224725')`,
      [oa],
    ),
  "42501",
);
assert.equal(
  (
    await db.query(`update public.carrier_drivers set name='Intruso' where id=$1 returning id`, [
      driverA,
    ])
  ).rows.length,
  0,
);
assert.equal(
  (
    await db.query(`update public.carrier_vehicles set plate='XYZ9A99' where id=$1 returning id`, [
      vehicleA,
    ])
  ).rows.length,
  0,
);
const driverB = (
  await db.query(
    `insert into public.carrier_drivers(organization_id,name,cpf) values($1,'Motorista B','52998224725') returning id`,
    [ob],
  )
).rows[0].id;
await db.query(
  `insert into public.carrier_vehicles(organization_id,plate,kind,axles) values($1,'ABC1D23','truck',3)`,
  [ob],
);
await rejects(
  () => db.query(`update public.carrier_drivers set organization_id=$1 where id=$2`, [oa, driverB]),
  "42501",
);
await asUser(v);
for (const table of ["carrier_drivers", "carrier_vehicles"])
  assert.equal((await db.query("select * from public." + table)).rows.length, 1);
await rejects(
  () =>
    db.query(
      `insert into public.carrier_vehicles(organization_id,plate,kind,axles) values($1,'XYZ9A99','truck',2)`,
      [oa],
    ),
  "42501",
);
assert.equal(
  (
    await db.query(`update public.carrier_drivers set active=false where id=$1 returning id`, [
      driverA,
    ])
  ).rows.length,
  0,
);
await asUser(a);
await db.query(`update public.carrier_drivers set active=false where id=$1`, [driverA]);
assert.equal(
  (await db.query(`select * from public.carrier_drivers where active=true`)).rows.length,
  0,
);
assert.equal((await db.query(`select * from public.carrier_drivers`)).rows.length, 1);
await rejects(() => db.query(`delete from public.carrier_drivers where id=$1`, [driverA]), "42501");
await db.exec("reset role; set role anon;");
for (const table of ["carrier_drivers", "carrier_vehicles"])
  await rejects(() => db.query("select * from public." + table), "42501");

// Atomic draft-to-trip conversion and immutable original snapshot.
await asUser(a);
const convert = (draftId, org, revision) =>
  db.query("select public.create_trip_from_draft($1,$2,$3) as result", [draftId, org, revision]);
await rejects(() => convert(draft, oa, 2), "22023");
assert.equal((await db.query("select * from public.trips")).rows.length, 0);
const source = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const payload = {
  reference: "FRETE ORIGINAL",
  origin: "Curitiba / PR",
  destination: "Santos / SP",
  driver: "Motorista teste",
  plate: "ABC1D23",
  freight: "1234.56",
  cargo: "Carga teste",
};
await db.query("select public.save_freight_draft($1,$2,$3,4,0)", [
  source,
  oa,
  JSON.stringify(payload),
]);
await rejects(() => convert(source, oa, 99), "40001");
assert.equal((await db.query("select * from public.trips")).rows.length, 0);
const first = (await convert(source, oa, 1)).rows[0].result;
assert.equal(first.created, true);
assert.equal(
  (await db.query("select freight_cents,status from public.trips")).rows[0].freight_cents,
  123456,
);
assert.equal((await db.query("select status from public.trips")).rows[0].status, "draft");
await db.query("select public.save_freight_draft($1,$2,$3,4,1)", [
  source,
  oa,
  JSON.stringify({ ...payload, reference: "EDIÇÃO POSTERIOR", freight: "9999.00" }),
]);
const repeated = (await convert(source, oa, 1)).rows[0].result;
assert.equal(repeated.trip_id, first.trip_id);
assert.equal(repeated.created, false);
assert.equal(repeated.source_revision, 1);
assert.equal((await db.query("select * from public.trips")).rows.length, 1);
assert.equal(
  (await db.query("select payload from public.trip_plans")).rows[0].payload.reference,
  "FRETE ORIGINAL",
);
await rejects(() => db.query("update public.trip_plans set source_revision=99"), "42501");
await asUser(b);
assert.equal((await db.query("select * from public.trip_plans")).rows.length, 0);
await rejects(() => convert(source, oa, 1), "42501");
await rejects(() => convert(source, ob, 1), "42501");
await asUser(v);
assert.equal((await db.query("select * from public.trip_plans")).rows.length, 1);
await rejects(() => convert(source, oa, 1), "42501");
await db.exec("reset role; set role anon;");
await rejects(() => db.query("select * from public.trip_plans"), "42501");
await rejects(() => convert(source, oa, 1), "42501");
console.log(
  "PASS: atomic planning conversion, exact cents, stale revision rejected, repeat without duplication, original snapshot preserved, tenant/viewer/anonymous restrictions.",
);
await db.exec("reset role;");
await db.query("delete from public.memberships where organization_id=$1 and user_id=$2", [oa, a]);
await asUser(a);
for (const table of ["freight_drafts", "carrier_drivers", "carrier_vehicles", "trip_plans"])
  assert.equal((await db.query("select * from public." + table)).rows.length, 0);
await rejects(() => save(oa, 2), "42501");
console.log("PASS: all 5 migrations applied to isolated PostgreSQL (PGlite).");
console.log(
  "PASS: driver/vehicle tenant isolation, scoped uniqueness, CPF check, blocked cross-tenant read/update/insert/transfer, viewer read-only, inactivation, no delete, anonymous denied, membership revocation.",
);
console.log(
  "PASS: insert/update, revision conflict, no direct writes, tenant isolation, cross-tenant mutation denied, viewer read-only, anonymous denied, size bound.",
);
await db.close();
