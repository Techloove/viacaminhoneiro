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
assert.equal((await save(oa, 0)).rows[0].saved.revision, 1);
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
console.log("PASS: all 3 migrations applied to isolated PostgreSQL (PGlite).");
console.log(
  "PASS: insert/update, revision conflict, no direct writes, tenant isolation, cross-tenant mutation denied, viewer read-only, anonymous denied, size bound.",
);
await db.close();
