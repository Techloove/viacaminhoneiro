import { describe, expect, it, vi } from "vitest";
import {
  createHandler,
  type Dependencies,
} from "../../supabase/functions/faznota-connection/handler";
const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const token = "fake-provider-token-for-tests";
function setup() {
  const authenticate = vi.fn(async () => "verified-user");
  const rpc = vi.fn(async (name: string) => ({
    data: name === "faznota_begin_auth_check" ? { token, generation: "generation-test" } : {},
    error: null as { code: string; message: string } | null,
  }));
  const providerFetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ status: "005", data: [{ name: "PRIVATE CUSTOMER" }] }), {
        status: 200,
        headers: { "X-API-Version": "3.13.0" },
      }),
  );
  const deps: Dependencies = {
    authenticate,
    rpc,
    providerFetch,
    allowedOrigins: ["https://viacaminhoneiro.lovable.app"],
  };
  return { authenticate, rpc, providerFetch, handler: createHandler(deps) };
}
const request = (
  body: Record<string, unknown>,
  auth = true,
  origin = "https://viacaminhoneiro.lovable.app",
) =>
  new Request("https://example.supabase.co/functions/v1/faznota-connection", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(auth ? { Authorization: "Bearer user-jwt" } : {}),
    },
    body: JSON.stringify({ organization_id: org, ...body }),
  });
describe("FazNota protected configuration endpoint", () => {
  it("rejects anonymous and invalid sessions before accessing credentials", async () => {
    const s = setup();
    expect((await s.handler(request({ action: "test" }, false))).status).toBe(401);
    expect(s.rpc).not.toHaveBeenCalled();
    s.authenticate.mockResolvedValueOnce(null as unknown as string);
    expect((await s.handler(request({ action: "test" }))).status).toBe(401);
    expect(s.providerFetch).not.toHaveBeenCalled();
  });
  it("rejects unknown browser origins", async () => {
    const s = setup();
    expect(
      (await s.handler(request({ action: "test" }, true, "https://untrusted.example"))).status,
    ).toBe(403);
    expect(s.authenticate).not.toHaveBeenCalled();
  });
  it("binds the actor to the validated session and never returns the stored token", async () => {
    const s = setup();
    const res = await s.handler(
      request({ action: "save", token, environment: "unconfirmed", p_actor_id: "forged-owner" }),
    );
    expect(res.status).toBe(200);
    expect(s.rpc).toHaveBeenCalledWith("faznota_store_credential", {
      p_organization_id: org,
      p_actor_id: "verified-user",
      p_token: token,
      p_environment: "unconfirmed",
    });
    expect(await res.text()).not.toContain(token);
    expect(s.providerFetch).not.toHaveBeenCalled();
  });
  it("rejects header injection and unsupported emission actions", async () => {
    const s = setup();
    expect(
      (
        await s.handler(
          request({ action: "save", token: "bad\r\nInjected: token", environment: "unconfirmed" }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await s.handler(request({ action: "emit", url: "https://other.example" }))).status,
    ).toBe(400);
    expect(s.rpc).not.toHaveBeenCalled();
    expect(s.providerFetch).not.toHaveBeenCalled();
  });
  it("refuses credentials for another organization when the database denies membership", async () => {
    const s = setup();
    s.rpc.mockResolvedValueOnce({ data: {}, error: { code: "42501", message: "denied" } });
    expect((await s.handler(request({ action: "test" }))).status).toBe(403);
    expect(s.providerFetch).not.toHaveBeenCalled();
  });
  it("tests only the fixed authenticated GET endpoint and discards customer data", async () => {
    const s = setup();
    const res = await s.handler(request({ action: "test" }));
    const json = await res.json();
    expect(json.authenticated).toBe(true);
    expect(s.providerFetch).toHaveBeenCalledWith(
      "https://api.mysebr.com.br/nfemyse-v3/rest/clientes?page=1&page_size=1",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: `Token ${token}`, Accept: "application/json" },
        redirect: "error",
      }),
    );
    expect(s.rpc).toHaveBeenLastCalledWith("faznota_record_auth_check", {
      p_organization_id: org,
      p_actor_id: "verified-user",
      p_generation: "generation-test",
      p_success: true,
      p_api_version: "3.13.0",
    });
    expect(JSON.stringify(json)).not.toContain("PRIVATE CUSTOMER");
    expect(JSON.stringify(json)).not.toContain(token);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("does not call the provider when the database rate-limits the test", async () => {
    const s = setup();
    s.rpc.mockResolvedValueOnce({ data: {}, error: { code: "P0001", message: "wait" } });
    expect((await s.handler(request({ action: "test" }))).status).toBe(429);
    expect(s.providerFetch).not.toHaveBeenCalled();
  });
  it("does not treat HTTP 200 alone as authentication confirmation", async () => {
    const s = setup();
    s.providerFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "999", descricao: token }), { status: 200 }),
    );
    const res = await s.handler(request({ action: "test" }));
    const json = await res.json();
    expect(json.authenticated).toBe(false);
    expect(JSON.stringify(json)).not.toContain(token);
    expect(s.rpc).toHaveBeenLastCalledWith(
      "faznota_record_auth_check",
      expect.objectContaining({ p_success: false }),
    );
  });
  it("sanitizes upstream failures and records no false success", async () => {
    const s = setup();
    s.providerFetch.mockRejectedValueOnce(Error(`request failed with ${token}`));
    const res = await s.handler(request({ action: "test" }));
    const json = await res.json();
    expect(json.authenticated).toBe(false);
    expect(JSON.stringify(json)).not.toContain(token);
  });
  it("rejects a result if the credential was rotated during its test", async () => {
    const s = setup();
    s.rpc.mockImplementation(async (name: string) =>
      name === "faznota_begin_auth_check"
        ? { data: { token, generation: "old" }, error: null }
        : { data: {}, error: { code: "40001", message: "rotated" } },
    );
    const res = await s.handler(request({ action: "test" }));
    expect(res.status).toBe(409);
    expect(await res.text()).not.toContain(token);
  });
  it("rejects non-object JSON instead of throwing an unhandled error", async () => {
    const s = setup();
    const req = new Request("https://example.test", {
      method: "POST",
      headers: { Authorization: "Bearer jwt", "Content-Type": "application/json" },
      body: "null",
    });
    expect((await s.handler(req)).status).toBe(400);
    expect(s.rpc).not.toHaveBeenCalled();
  });
});
