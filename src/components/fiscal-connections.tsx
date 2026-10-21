import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, PlugZap, RefreshCw, Unplug } from "lucide-react";
import { supabase } from "../supabase";
type Connection = {
  credential_configured: boolean;
  declared_environment: "unconfirmed" | "homologation" | "production";
  authentication_state: "unchecked" | "authenticated" | "failed";
  last_checked_at: string | null;
  api_version: string | null;
};
type Event = { id: string; event: string; created_at: string };
const eventLabels: Record<string, string> = {
  credential_saved: "Credencial atualizada",
  authentication_confirmed: "Autenticação confirmada por leitura",
  authentication_unconfirmed: "Autenticação não confirmada",
  disconnected: "Credencial removida",
};
export default function FiscalConnections({
  organizationId,
  role,
}: {
  organizationId: string | null;
  role: string | null;
}) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [token, setToken] = useState("");
  const [environment, setEnvironment] = useState<Connection["declared_environment"]>("unconfirmed");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const canManage = role === "owner" || role === "manager" || role === "platform_admin";
  useEffect(() => {
    let active = true;
    if (!supabase || !organizationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("fiscal_connections")
      .select(
        "credential_configured,declared_environment,authentication_state,last_checked_at,api_version",
      )
      .eq("organization_id", organizationId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        setLoading(false);
        if (error) {
          setReady(false);
          setError(
            ["PGRST205", "42P01"].includes(error.code)
              ? "Aplique a migração 202610210006_faznota_connections.sql para preparar a integração."
              : "Não foi possível consultar a configuração fiscal.",
          );
          return;
        }
        setReady(true);
        setConnection(data);
        if (data) setEnvironment(data.declared_environment);
      });
    if (canManage)
      supabase
        .from("fiscal_connection_events")
        .select("id,event,created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(5)
        .then(({ data }) => {
          if (active) setEvents(data ?? []);
        });
    return () => {
      active = false;
    };
  }, [organizationId, canManage, reload]);
  async function execute(action: "save" | "test" | "disconnect") {
    if (!supabase || !organizationId || busy || !canManage || !ready) return;
    if (
      action === "disconnect" &&
      !window.confirm("Remover a credencial desta integração? Isso não revoga o token no FazNota.")
    )
      return;
    setBusy(action);
    setError("");
    setMessage("");
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw Error("Sua sessão expirou. Entre novamente.");
      const body: Record<string, unknown> = { action, organization_id: organizationId };
      if (action === "save") {
        body["token"] = token.trim();
        body["environment"] = environment;
      }
      const { data, error } = await supabase.functions.invoke("faznota-connection", {
        body,
        headers: { Authorization: `Bearer ${session.session.access_token}` },
      });
      if (error) {
        const status = error.context instanceof Response ? error.context.status : 0;
        throw Error(
          status === 401
            ? "Sua sessão expirou. Entre novamente."
            : status === 403
              ? "Acesso negado. Confira seu perfil e a origem autorizada na função."
              : status === 429
                ? "Aguarde pelo menos 15 segundos antes de testar novamente."
                : status === 409
                  ? "A credencial foi alterada. Refaça o teste."
                  : "Não foi possível confirmar a ação. Verifique se a função faznota-connection foi publicada e a migração 006 foi aplicada.",
        );
      }
      if (!data || data.ok !== true || typeof data.message !== "string")
        throw Error("Resposta inesperada do servidor. A ação não foi confirmada.");
      if (action === "test" && typeof data.authenticated !== "boolean")
        throw Error("O teste não retornou uma confirmação válida.");
      if (action === "test" && data.authenticated === false) setError(data.message);
      else setMessage(data.message);
      setReload((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (action === "save") setToken("");
      setBusy(null);
    }
  }
  return (
    <>
      <section className="panel">
        <div className="section-title">
          <div>
            <span className="eyebrow">CONEXÃO POR TRANSPORTADORA</span>
            <h2>Integrações fiscais</h2>
            <p>Configure o acesso ao FazNota sem colocar credenciais no código do aplicativo.</p>
          </div>
          <PlugZap />
        </div>
        <div className="banner">
          Nenhuma emissão habilitada. O ambiente da conta ainda precisa ser confirmado com o
          FazNota; o teste de leitura não verifica certificado, CNPJ emissor ou habilitação fiscal.
        </div>
        {error && (
          <div className="notice" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="connection-feedback" role="status">
            {message}
          </div>
        )}
        <div className="integration-grid">
          <article>
            <KeyRound size={22} />
            <h3>Credencial da empresa</h3>
            <p>
              {loading
                ? "Consultando…"
                : connection?.credential_configured
                  ? "Armazenada no Vault"
                  : "Não configurada"}
            </p>
            <small>O navegador não recebe o token armazenado.</small>
          </article>
          <article>
            <ShieldCheck size={22} />
            <h3>Último teste de autenticação</h3>
            <p>
              {connection?.authentication_state === "authenticated"
                ? "Confirmada por consulta de leitura"
                : connection?.authentication_state === "failed"
                  ? "Não confirmada"
                  : "Não realizado"}
            </p>
            <small>
              {connection?.last_checked_at
                ? new Date(connection.last_checked_at).toLocaleString("pt-BR")
                : "Sem resultado externo confirmado."}
              {connection?.api_version ? ` · API ${connection.api_version}` : ""}
            </small>
          </article>
        </div>
        <p className="hint">
          Ambiente declarado:{" "}
          {connection?.declared_environment === "homologation"
            ? "homologação — declaração do usuário"
            : connection?.declared_environment === "production"
              ? "produção — declaração do usuário"
              : "a confirmar"}
          . Essa informação não altera o ambiente cadastrado no FazNota.
        </p>
        {canManage ? (
          <form
            className="connection-form"
            onSubmit={(e) => {
              e.preventDefault();
              void execute("save");
            }}
          >
            <label>
              Token de integração do FazNota
              <input
                type="password"
                name="provider-token"
                autoComplete="off"
                spellCheck={false}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
                minLength={8}
                maxLength={4096}
                disabled={!!busy || !ready}
                placeholder={
                  connection?.credential_configured
                    ? "Informe um novo token para substituir"
                    : "Token gerado no painel FazNota"
                }
              />
            </label>
            <label>
              Ambiente declarado da conta
              <select
                value={environment}
                onChange={(e) =>
                  setEnvironment(e.target.value as Connection["declared_environment"])
                }
                disabled={!!busy || !ready}
              >
                <option value="unconfirmed">A confirmar com o fornecedor</option>
                <option value="homologation">Homologação confirmada pelo fornecedor</option>
                <option value="production">Produção</option>
              </select>
            </label>
            <p className="hint">
              Enviado por HTTPS à função de backend e armazenado no Supabase Vault. O campo é limpo
              após a tentativa; não salvamos o valor no armazenamento do navegador. Não envie
              certificado, senha ou chave administrativa aqui.
            </p>
            <div className="connection-actions">
              <button className="primary" disabled={!!busy || !ready}>
                <KeyRound size={16} />
                {busy === "save" ? "Armazenando…" : "Armazenar credencial com segurança"}
              </button>
              <button
                className="secondary"
                type="button"
                disabled={!!busy || !ready || !connection?.credential_configured}
                onClick={() => void execute("test")}
              >
                <RefreshCw size={16} />
                {busy === "test" ? "Testando leitura…" : "Testar autenticação sem emitir"}
              </button>
              <button
                className="secondary"
                type="button"
                disabled={!!busy || !ready || !connection?.credential_configured}
                onClick={() => void execute("disconnect")}
              >
                <Unplug size={16} />
                Desconectar
              </button>
            </div>
          </form>
        ) : (
          <div className="banner">
            Somente o proprietário ou gestor da transportadora pode configurar ou testar
            credenciais. Seu perfil permite consultar o estado da integração.
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Capacidades confirmadas na documentação 3.13.0</h2>
        <div className="integration-grid">
          <article>
            <h3>CT-e e MDF-e</h3>
            <p>
              Rotas de emissão e eventos documentadas. Payloads completos e consultas de resultado
              ainda precisam de confirmação do fornecedor.
            </p>
          </article>
          <article>
            <h3>CIOT para ETC com frota própria</h3>
            <p>
              Rotas de emissão, consulta, retificação, cancelamento e encerramento. A1, RNTRC e
              ambiente vêm do cadastro da empresa no FazNota.
            </p>
            <small>
              TAC e equiparado a TAC exigem outro caminho por instituição de pagamento. Não
              habilitado nesta versão do aplicativo.
            </small>
          </article>
        </div>
        <a
          href="https://faznota.com.br/api/v3/recipes/emitir-ciot/"
          target="_blank"
          rel="noreferrer"
          className="documentation-link"
        >
          Ver guia oficial de CIOT
        </a>
      </section>
      {canManage && events.length > 0 && (
        <section className="panel">
          <h2>Histórico da conexão</h2>
          {events.map((e) => (
            <div className="connection-event" key={e.id}>
              <strong>{eventLabels[e.event] ?? "Evento da integração"}</strong>
              <small>{new Date(e.created_at).toLocaleString("pt-BR")}</small>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
