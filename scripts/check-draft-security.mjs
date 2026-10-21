import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(
  `create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`,
);
// Test-only Vault interface. Encryption is provided by Supabase Vault in production,
// not verified by PGlite. These fixtures use fake tokens only and never reach a real project.
await db.exec(
  `create schema vault; create table vault.secrets(id uuid primary key default gen_random_uuid(),secret text not null); create view vault.decrypted_secrets as select id,secret as decrypted_secret from vault.secrets; create function vault.create_secret(secret text) returns uuid language sql as $$insert into vault.secrets(secret) values(secret) returning id$$; create function vault.update_secret(secret_id uuid,new_secret text) returns void language sql as $$update vault.secrets set secret=new_secret where id=secret_id$$; revoke all on schema vault from public,anon,authenticated;`,
);
for (const name of [
  "202610210001_initial.sql",
  "202610210002_carrier_workflow.sql",
  "202610210003_freight_drafts.sql",
  "202610210004_fleet_registry.sql",
  "202610210005_trip_planning.sql",
  "202610210006_faznota_connections.sql",
  "202610210007_saas_administration.sql",
])
  await db.exec(
    readFileSync(new URL("../supabase/migrations/" + name, import.meta.url), "utf8").replace(
      "create extension if not exists supabase_vault with schema vault;",
      "-- Test-only Vault interface supplied above.",
    ),
  );
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  v = "33333333-3333-4333-8333-333333333333";
const oa = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ob = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  draft = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
await db.query(`insert into auth.users(id) values ($1),($2),($3)`, [a, b, v]);
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

// Service-only credential operations; a browser cannot forge the actor RPC parameter.
await asUser(a);
await rejects(
  () =>
    db.query("select public.faznota_store_credential($1,$2,'fake-provider-token','unconfirmed')", [
      oa,
      a,
    ]),
  "42501",
);
await rejects(() => db.query("select public.faznota_begin_auth_check($1,$2)", [oa, a]), "42501");
await rejects(() => db.query("select * from via_fiscal_private.faznota_credentials"), "42501");
await db.exec("reset role; set role service_role;");
const stored = (
  await db.query(
    "select public.faznota_store_credential($1,$2,'fake-provider-token','unconfirmed') as result",
    [oa, a],
  )
).rows[0].result;
assert.equal(stored.credential_configured, true);
assert.equal(stored.authentication_state, "unchecked");
assert.ok(!JSON.stringify(stored).includes("fake-provider-token"));
await rejects(
  () =>
    db.query("select public.faznota_store_credential($1,$2,'fake-provider-token','unconfirmed')", [
      oa,
      b,
    ]),
  "42501",
);
const credential = (
  await db.query("select public.faznota_begin_auth_check($1,$2) as result", [oa, a])
).rows[0].result;
assert.equal(credential.token, "fake-provider-token");
await rejects(() => db.query("select public.faznota_begin_auth_check($1,$2)", [oa, a]), "P0001");
await db.query("select public.faznota_record_auth_check($1,$2,$3,true,'3.13.0')", [
  oa,
  a,
  credential.generation,
]);
await asUser(a);
const metadata = (await db.query("select * from public.fiscal_connections")).rows[0];
assert.equal(metadata.authentication_state, "authenticated");
assert.ok(!JSON.stringify(metadata).includes("fake-provider-token"));
await rejects(
  () => db.query("update public.fiscal_connections set authentication_state='authenticated'"),
  "42501",
);
await asUser(b);
assert.equal((await db.query("select * from public.fiscal_connections")).rows.length, 0);
assert.equal((await db.query("select * from public.fiscal_connection_events")).rows.length, 0);
await asUser(v);
assert.equal((await db.query("select * from public.fiscal_connections")).rows.length, 1);
assert.equal((await db.query("select * from public.fiscal_connection_events")).rows.length, 0);
await db.exec("reset role; set role service_role;");
await db.query("select public.faznota_store_credential($1,$2,'fake-rotated-token','unconfirmed')", [
  oa,
  a,
]);
await rejects(
  () =>
    db.query("select public.faznota_record_auth_check($1,$2,$3,true,'3.13.0')", [
      oa,
      a,
      credential.generation,
    ]),
  "40001",
);
await db.query("select public.faznota_disconnect($1,$2)", [oa, a]);
await rejects(() => db.query("select public.faznota_begin_auth_check($1,$2)", [oa, a]), "22023");
await asUser(a);
assert.equal(
  (await db.query("select * from public.fiscal_connections")).rows[0].credential_configured,
  false,
);
await db.exec("reset role; set role anon;");
await rejects(() => db.query("select * from public.fiscal_connections"), "42501");
await rejects(() => db.query("select public.faznota_begin_auth_check($1,$2)", [oa, a]), "42501");
console.log(
  "PASS: service-only credentials, metadata isolation, no browser token access, audit access, test throttling, rotation conflict and disconnect (Vault interface mocked; no encryption claim).",
);
await db.exec("reset role;");
const root = "99999999-9999-4999-8999-999999999999";
await db.query("insert into auth.users(id,email) values($1,'admin@example.test')", [root]);
await db.query("insert into via_platform_private.admins(user_id) values($1)", [root]);
await asUser(a);
await rejects(() => db.query("select public.platform_list_companies()"), "42501");
await rejects(() => db.query("insert into via_platform_private.admins(user_id) values($1)",[a]), "42501");
await db.query("insert into public.carrier_customers(organization_id,name,document) values($1,'Cliente A','52998224725')",[oa]);
await asUser(b);
assert.equal((await db.query("select * from public.carrier_customers")).rows.length,0);
await rejects(() => db.query("insert into public.carrier_customers(organization_id,name,document) values($1,'Intruso','52998224725')",[oa]), "42501");
await asUser(root);
assert.equal((await db.query("select * from public.carrier_customers")).rows.length,0);
assert.equal((await db.query("select * from public.trip_plans")).rows.length,0);
assert.equal((await db.query("select public.platform_list_companies() as companies")).rows[0].companies.length,2);
await db.query("select public.platform_save_company($1,'Transportadora A','11222333000181',null,'Inicial','active',19900,5,1,0,null)",[oa]);
await db.exec("reset role; set role service_role");
const operation = "88888888-8888-4888-8888-888888888888";
const reserved = (await db.query("select public.platform_reserve_document($1,$2,'cte',$3) as result",[oa,a,operation])).rows[0].result;
assert.equal(reserved.reused,false);
assert.equal((await db.query("select public.platform_reserve_document($1,$2,'cte',$3) as result",[oa,a,operation])).rows[0].result.reused,true);
await rejects(() => db.query("select public.platform_reserve_document($1,$2,'cte',gen_random_uuid())",[oa,a]),"P0001");
await rejects(() => db.query("select public.platform_reserve_document($1,$2,'ciot',gen_random_uuid())",[oa,a]),"P0001");
await rejects(() => db.query("select public.platform_reserve_document($1,$2,'mdfe',gen_random_uuid())",[oa,root]),"42501");
await db.query("select public.platform_reserve_document($1,$2,'mdfe',gen_random_uuid())",[oa,a]);
await db.query("select public.platform_complete_document($1,$2,true)",[oa,reserved.reservation_id]);
await db.query("select public.platform_complete_document($1,$2,false)",[oa,reserved.reservation_id]);
await asUser(a);
assert.equal((await db.query("select state from public.document_quota_reservations where id=$1",[reserved.reservation_id])).rows[0].state,"confirmed");
await rejects(() => db.query("select public.platform_reserve_document($1,$2,'cte',gen_random_uuid())",[oa,a]),"42501");
await asUser(b);
assert.equal((await db.query("select * from public.tenant_subscriptions")).rows.length,0);
await asUser(v);
await rejects(() => db.query("insert into public.carrier_customers(organization_id,name,document) values($1,'Viewer','11222333000181')",[oa]),"42501");
console.log("PASS: explicit platform administration, no operational access for platform-only admin, customer tenant isolation, subscription isolation, service-only quota, idempotence, limits, unlimited tier and confirmed usage retention.");
await db.exec("reset role;");
await db.query("delete from public.memberships where organization_id=$1 and user_id=$2", [oa, a]);
await asUser(a);
for (const table of [
  "freight_drafts",
  "carrier_drivers",
  "carrier_vehicles",
  "trip_plans",
  "fiscal_connections",
  "carrier_customers",
  "tenant_subscriptions",
  "document_quota_reservations",
])
  assert.equal((await db.query("select * from public." + table)).rows.length, 0);
await rejects(() => save(oa, 2), "42501");
console.log(
  "PASS: all 7 migrations applied (Vault extension mocked only for local tests) to isolated PostgreSQL (PGlite).",
);
console.log(
  "PASS: driver/vehicle tenant isolation, scoped uniqueness, CPF check, blocked cross-tenant read/update/insert/transfer, viewer read-only, inactivation, no delete, anonymous denied, membership revocation.",
);
console.log(
  "PASS: insert/update, revision conflict, no direct writes, tenant isolation, cross-tenant mutation denied, viewer read-only, anonymous denied, size bound.",
);
await db.close();
