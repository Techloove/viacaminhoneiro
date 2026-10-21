export type RpcError = { code?: string; message: string };
export type Dependencies = {
  authenticate: (bearer: string) => Promise<string | null>;
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcError | null }>;
  providerFetch: (url: string, init: RequestInit) => Promise<Response>;
  allowedOrigins: string[];
};
export async function limitedJson(input: Request | Response, max = 8192) {
  const reader = input.body?.getReader();
  if (!reader) throw Error("empty");
  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw Error("size");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  const parsed = JSON.parse(new TextDecoder().decode(all));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("object");
  return parsed as Record<string, unknown>;
}
export function createHandler(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get("Origin");
    const allowed = !origin || deps.allowedOrigins.includes(origin);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "cache-control": "no-store",
      vary: "Origin",
    };
    if (origin && allowed) headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-headers"] = "authorization,apikey,content-type,x-client-info";
    headers["access-control-allow-methods"] = "POST,OPTIONS";
    const respond = (status: number, data: Record<string, unknown>) =>
      new Response(JSON.stringify(data), { status, headers });
    if (!allowed) return respond(403, { error: "Origem não permitida." });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return respond(405, { error: "Método não permitido." });
    const bearer = req.headers.get("Authorization")?.match(/^Bearer (\S+)$/i)?.[1];
    if (!bearer) return respond(401, { error: "Entre novamente para configurar a integração." });
    let actor: string | null;
    try {
      actor = await deps.authenticate(bearer);
    } catch {
      return respond(503, { error: "Não foi possível validar sua sessão." });
    }
    if (!actor) return respond(401, { error: "Sessão inválida ou expirada." });
    let body: Record<string, unknown>;
    try {
      if (!req.headers.get("content-type")?.includes("application/json")) throw Error("type");
      body = await limitedJson(req);
    } catch {
      return respond(400, { error: "Requisição inválida ou muito grande." });
    }
    const org = body["organization_id"];
    if (
      typeof org !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(org)
    )
      return respond(400, { error: "Transportadora inválida." });
    const rpc = async (name: string, extra: Record<string, unknown> = {}) => {
      const r = await deps.rpc(name, { p_organization_id: org, p_actor_id: actor, ...extra });
      if (r.error) throw r.error;
      return r.data;
    };
    try {
      if (body["action"] === "save") {
        const token = body["token"];
        const env = body["environment"];
        if (
          typeof token !== "string" ||
          token.length < 8 ||
          token.length > 4096 ||
          /\s/.test(token) ||
          Array.from(token).some(
            (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
          ) ||
          !["unconfirmed", "homologation", "production"].includes(String(env))
        )
          return respond(400, { error: "Confira token e ambiente declarado." });
        await rpc("faznota_store_credential", { p_token: token, p_environment: env });
        return respond(200, {
          ok: true,
          message: "Credencial armazenada no Vault. Autenticação ainda não testada.",
        });
      }
      if (body["action"] === "disconnect") {
        await rpc("faznota_disconnect");
        return respond(200, {
          ok: true,
          message:
            "Credencial removida desta integração. Se necessário, revogue-a também no FazNota.",
        });
      }
      if (body["action"] !== "test")
        return respond(400, { error: "Ação não disponível. Este serviço não emite documentos." });
      const credential = (await rpc("faznota_begin_auth_check")) as {
        token?: unknown;
        generation?: unknown;
      };
      if (typeof credential?.token !== "string" || typeof credential.generation !== "string")
        return respond(503, { error: "Credencial indisponível no servidor." });
      let success = false;
      let apiVersion: string | null = null;
      let upstreamResult = "Teste sem confirmação. Confira acesso e credencial no FazNota.";
      try {
        const response = await deps.providerFetch(
          "https://api.mysebr.com.br/nfemyse-v3/rest/clientes?page=1&page_size=1",
          {
            method: "GET",
            headers: { Authorization: `Token ${credential.token}`, Accept: "application/json" },
            redirect: "error",
            signal: AbortSignal.timeout(12000),
          },
        );
        if (response.status === 401 || response.status === 403)
          upstreamResult = "O FazNota recusou a autenticação. Confira a credencial.";
        else if (response.status === 429)
          upstreamResult = "O FazNota limitou as consultas. Aguarde antes de testar novamente.";
        else if (response.ok) {
          const result = await limitedJson(response, 65536);
          success = result["status"] === "005";
          const header = response.headers.get("X-API-Version");
          if (header && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(header)) apiVersion = header;
          if (success)
            upstreamResult =
              "Autenticação confirmada por consulta de leitura. Ambiente, certificado e habilitação fiscal não foram verificados.";
        }
      } catch {
        /* Never log or return raw errors, upstream data, Authorization or credentials. */
      }
      await rpc("faznota_record_auth_check", {
        p_generation: credential.generation,
        p_success: success,
        p_api_version: apiVersion,
      });
      return respond(200, { ok: true, authenticated: success, message: upstreamResult });
    } catch (e) {
      const code = (e as RpcError)?.code;
      if (code === "42501")
        return respond(403, {
          error:
            "Somente proprietário ou gestor da transportadora pode configurar esta integração.",
        });
      if (code === "P0001")
        return respond(429, { error: "Aguarde pelo menos 15 segundos antes de testar novamente." });
      if (code === "40001")
        return respond(409, {
          error: "A credencial foi alterada durante o teste. Refaça a verificação.",
        });
      if (code === "22023")
        return respond(400, { error: "Configuração incompleta ou credencial indisponível." });
      return respond(503, {
        error:
          "Integração indisponível. Verifique a migração 006 e a publicação da função no Supabase.",
      });
    }
  };
}
