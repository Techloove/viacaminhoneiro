import { useEffect, useState } from "react";
import { Building2, Plus, Search, Settings2, X } from "lucide-react";
import { supabase } from "../supabase";
import { validCnpj } from "../lib/cnpj";
type Company = {
  id: string;
  name: string;
  cnpj: string | null;
  rntrc: string | null;
  plan_name: string | null;
  status: string | null;
  monthly_fee_cents: number | null;
  due_day: number | null;
  limit_cte: number | null;
  limit_ciot: number | null;
  limit_mdfe: number | null;
  used_cte: number;
  used_ciot: number;
  used_mdfe: number;
  user_count: number;
};
const statuses: Record<string, string> = {
  active: "Ativa",
  paused: "Pausada",
  overdue: "Inadimplente",
  cancelled: "Cancelada",
};
const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v / 100);
export default function PlatformAdmin({
  onConfigureFiscal,
}: {
  onConfigureFiscal: (organizationId: string, name: string) => void;
}) {
  const [rows, setRows] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    if (!supabase) return;
    setLoading(true);
    supabase.rpc("platform_list_companies").then(({ data, error }) => {
      if (!active) return;
      setLoading(false);
      if (error) {
        setError(
          error.code === "42501"
            ? "Administração da plataforma restrita."
            : "Não foi possível carregar as empresas. Confira a migração 007 e a ativação do administrador.",
        );
        return;
      }
      setRows(Array.isArray(data) ? data : []);
    });
    return () => {
      active = false;
    };
  }, [reload]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase || busy) return;
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    const cnpj = get("cnpj").replace(/\D/g, "");
    if (!validCnpj(cnpj)) {
      setError("Confira os dígitos verificadores do CNPJ.");
      return;
    }
    const amount = get("fee");
    if (!/^\d{1,9}([.,]\d{1,2})?$/.test(amount)) {
      setError("Informe a mensalidade em reais com até duas casas decimais.");
      return;
    }
    const limit = (k: string) => (get(k) === "" ? null : Number(get(k)));
    const limits = ["limit_cte", "limit_ciot", "limit_mdfe"].map(limit);
    if (limits.some((n) => n !== null && (!Number.isInteger(n) || n < 0 || n > 1000000))) {
      setError("Limites devem ser inteiros de 0 a 1.000.000, ou vazios para ilimitado.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.rpc("platform_save_company", {
        p_organization_id: company?.id ?? null,
        p_name: get("name"),
        p_cnpj: cnpj,
        p_owner_email: get("owner_email"),
        p_plan_name: get("plan_name"),
        p_status: get("status"),
        p_fee_cents: Math.round(Number(amount.replace(",", ".")) * 100),
        p_due_day: Number(get("due_day")),
        p_limit_cte: limits[0],
        p_limit_ciot: limits[1],
        p_limit_mdfe: limits[2],
      });
      if (error) throw error;
      setEditing(false);
      setMessage("Configuração da empresa salva. Nenhuma cobrança foi realizada.");
      setReload((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const filtered = rows.filter((r) =>
    `${r.name} ${r.cnpj ?? ""}`
      .toLocaleLowerCase("pt-BR")
      .includes(query.toLocaleLowerCase("pt-BR")),
  );
  return (
    <>
      <section className="panel">
        <div className="section-title">
          <div>
            <span className="eyebrow">ADMINISTRAÇÃO DA PLATAFORMA</span>
            <h2>Empresas e assinaturas</h2>
            <p>Área restrita ao operador do SaaS, separada dos usuários das transportadoras.</p>
          </div>
          <button
            className="primary"
            disabled={loading}
            onClick={() => {
              setCompany(null);
              setError("");
              setEditing(true);
            }}
          >
            <Plus size={16} />
            Cadastrar empresa
          </button>
        </div>
        <div className="stats platform-stats">
          <article>
            <div>
              Empresas cadastradas
              <Building2 size={18} />
            </div>
            <strong>{rows.length}</strong>
          </article>
          <article>
            <div>Assinaturas ativas</div>
            <strong>{rows.filter((r) => r.status === "active").length}</strong>
          </article>
          <article>
            <div>Mensalidades previstas</div>
            <strong>
              {money(
                rows
                  .filter((r) => r.status === "active")
                  .reduce((s, r) => s + (r.monthly_fee_cents ?? 0), 0),
              )}
            </strong>
            <small>Não representa recebimento confirmado</small>
          </article>
        </div>
        {!editing && error && (
          <div className="notice" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="connection-feedback" role="status">
            {message}
          </div>
        )}
        <div className="registry-filters">
          <label className="draft-search">
            <Search size={17} />
            <input
              aria-label="Buscar empresa"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Busque razão social ou CNPJ"
            />
          </label>
          <button className="secondary" disabled={loading} onClick={() => setReload((n) => n + 1)}>
            Atualizar
          </button>
        </div>
        {loading ? (
          <p>Consultando empresas…</p>
        ) : filtered.length ? (
          <div className="company-cards">
            {filtered.map((r) => (
              <article key={r.id}>
                <div className="section-title">
                  <div>
                    <h3>{r.name}</h3>
                    <p>{r.cnpj || "CNPJ a configurar"}</p>
                  </div>
                  <span className="status">
                    {r.status ? statuses[r.status] : "Assinatura não configurada"}
                  </span>
                </div>
                <p>
                  {r.plan_name || "Plano a configurar"} · {money(r.monthly_fee_cents ?? 0)} / mês ·{" "}
                  {r.user_count} usuário(s)
                </p>
                <div className="quota-counters">
                  {(["cte", "ciot", "mdfe"] as const).map((kind) => (
                    <div key={kind}>
                      <strong>
                        {kind === "cte" ? "CT-e" : kind === "ciot" ? "CIOT" : "MDF-e"}
                      </strong>
                      <span>
                        {r[`used_${kind}`] ?? 0} /{" "}
                        {r.status == null ? "—" : (r[`limit_${kind}`] ?? "ilimitado")}
                      </span>
                    </div>
                  ))}
                </div>
                <small>
                  Uso do mês registrado nesta plataforma, incluindo reservas pendentes. Não inclui
                  documentos emitidos fora dela.
                </small>
                <div className="connection-actions">
                  <button
                    className="secondary"
                    onClick={() => {
                      setCompany(r);
                      setError("");
                      setEditing(true);
                    }}
                  >
                    Editar empresa e plano
                  </button>
                  <button className="secondary" onClick={() => onConfigureFiscal(r.id, r.name)}>
                    <Settings2 size={15} />
                    Configurar API da empresa
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">
            <p>Nenhuma empresa encontrada.</p>
          </div>
        )}
        <div className="banner">
          Controle administrativo de mensalidades, sem cobrança automática. Pausa e inadimplência
          bloqueiam novas reservas de emissão no backend; a transmissão fiscal continua desabilitada
          enquanto as integrações não forem concluídas.
        </div>
      </section>
      {editing && (
        <div className="overlay">
          <section
            className="dialog company-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="company-title"
          >
            <button
              className="close"
              aria-label="Fechar empresa"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              <X />
            </button>
            <h2 id="company-title">{company ? "Configurar empresa" : "Cadastrar empresa"}</h2>
            {error && (
              <div className="notice" role="alert">
                {error}
              </div>
            )}
            <form onSubmit={save}>
              <fieldset disabled={busy} className="wizard-fields">
                <div className="wizard-grid">
                  <label>
                    Razão social
                    <input name="name" required maxLength={160} defaultValue={company?.name} />
                  </label>
                  <label>
                    CNPJ da transportadora
                    <input name="cnpj" required maxLength={18} defaultValue={company?.cnpj ?? ""} />
                  </label>
                  <label>
                    Vincular proprietário existente (e-mail opcional)
                    <input
                      name="owner_email"
                      type="email"
                      placeholder="Usuário já cadastrado no Supabase Auth"
                    />
                  </label>
                  <label>
                    Nome do plano
                    <input
                      name="plan_name"
                      required
                      maxLength={100}
                      defaultValue={company?.plan_name ?? "Personalizado"}
                    />
                  </label>
                  <label>
                    Situação da assinatura
                    <select name="status" defaultValue={company?.status ?? "paused"}>
                      {Object.entries(statuses).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Mensalidade (R$)
                    <input
                      name="fee"
                      required
                      type="number"
                      min="0"
                      max="100000000"
                      step="0.01"
                      defaultValue={((company?.monthly_fee_cents ?? 0) / 100).toFixed(2)}
                    />
                  </label>
                  <label>
                    Dia de vencimento
                    <input
                      name="due_day"
                      required
                      type="number"
                      min="1"
                      max="28"
                      defaultValue={company?.due_day ?? 5}
                    />
                  </label>
                  {(["cte", "ciot", "mdfe"] as const).map((kind) => (
                    <label key={kind}>
                      Limite mensal {kind === "cte" ? "CT-e" : kind === "ciot" ? "CIOT" : "MDF-e"}
                      <input
                        name={`limit_${kind}`}
                        type="number"
                        min="0"
                        max="1000000"
                        step="1"
                        defaultValue={company ? (company[`limit_${kind}`] ?? "") : 0}
                      />
                    </label>
                  ))}
                </div>
                <p className="hint">
                  Limite zero bloqueia o tipo de documento; campo vazio significa ilimitado. O mês
                  de uso segue o calendário de Brasília. Não cadastramos senhas nem enviamos
                  convites automaticamente.
                </p>
              </fieldset>
              <button className="primary" disabled={busy}>
                {busy ? "Salvando…" : "Salvar empresa e assinatura"}
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
