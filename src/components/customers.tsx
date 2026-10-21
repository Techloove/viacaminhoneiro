import { useEffect, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { supabase } from "../supabase";
import { validCpf } from "../lib/fleet";
import { validCnpj } from "../lib/cnpj";
export type Customer = {
  id: string;
  organization_id: string;
  name: string;
  document: string;
  email: string;
  phone: string;
  zip_code: string;
  street: string;
  address_number: string;
  district: string;
  city: string;
  state: string;
  ibge_code: string;
  active: boolean;
};
const states =
  "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
export default function Customers({ organizationId }: { organizationId: string | null }) {
  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(Boolean(supabase && organizationId));
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [inactive, setInactive] = useState(false);
  const [editing, setEditing] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    if (!supabase || !organizationId) return;
    setLoading(true);
    supabase
      .from("carrier_customers")
      .select("*")
      .eq("organization_id", organizationId)
      .order("name")
      .limit(1000)
      .then(({ data, error }) => {
        if (!active) return;
        setLoading(false);
        if (error)
          setError(
            ["42P01", "PGRST205"].includes(error.code)
              ? "Aplique a migração 007 para habilitar a base de clientes."
              : "Não foi possível consultar os clientes.",
          );
        else setRows(data ?? []);
      });
    return () => {
      active = false;
    };
  }, [organizationId, reload]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    const doc = get("document").replace(/\D/g, "");
    if (!validCpf(doc) && !validCnpj(doc)) {
      setError("Confira o CPF/CNPJ do cliente.");
      return;
    }
    const payload = {
      name: get("name"),
      document: doc,
      email: get("email"),
      phone: get("phone"),
      zip_code: get("zip_code").replace(/\D/g, ""),
      street: get("street"),
      address_number: get("address_number"),
      district: get("district"),
      city: get("city"),
      state: get("state"),
      ibge_code: get("ibge_code"),
      active: f.get("active") === "on",
    };
    if (payload.zip_code && !/^\d{8}$/.test(payload.zip_code)) {
      setError("Confira o CEP com 8 dígitos.");
      return;
    }
    if (payload.ibge_code && !/^\d{7}$/.test(payload.ibge_code)) {
      setError("Confira o código IBGE com 7 dígitos.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      let row: Customer;
      if (supabase) {
        if (!organizationId) throw Error("Selecione sua transportadora.");
        const q = customer
          ? supabase
              .from("carrier_customers")
              .update(payload)
              .eq("id", customer.id)
              .eq("organization_id", organizationId)
          : supabase
              .from("carrier_customers")
              .insert({ ...payload, organization_id: organizationId });
        const { data, error } = await q.select().single();
        if (error) throw error;
        row = data;
      } else row = { ...payload, id: customer?.id ?? crypto.randomUUID(), organization_id: "demo" };
      setRows((old) => [row, ...old.filter((r) => r.id !== row.id)]);
      setEditing(false);
      setMessage(
        supabase
          ? "Cliente salvo na sua transportadora."
          : "Cliente temporário em modo de demonstração.",
      );
    } catch (e) {
      const err = e as { code?: string; message: string };
      setError(
        err.code === "23505"
          ? "Este CPF/CNPJ já está cadastrado nesta transportadora. Confira os inativos."
          : err.message,
      );
    } finally {
      setBusy(false);
    }
  }
  const filtered = rows.filter(
    (r) =>
      (r.active || inactive) &&
      `${r.name} ${r.document} ${r.city}`
        .toLocaleLowerCase("pt-BR")
        .includes(query.toLocaleLowerCase("pt-BR")),
  );
  return (
    <>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Clientes da transportadora</h2>
            <p>Cadastros exclusivos desta empresa. Até 1.000 registros carregados.</p>
          </div>
          <button
            className="primary"
            disabled={loading}
            onClick={() => {
              setCustomer(null);
              setError("");
              setEditing(true);
            }}
          >
            <Plus size={16} />
            Cadastrar cliente
          </button>
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
              aria-label="Buscar cliente"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nome, CPF/CNPJ ou cidade"
            />
          </label>
          <label className="fleet-active">
            <input
              type="checkbox"
              checked={inactive}
              onChange={(e) => setInactive(e.target.checked)}
            />
            Mostrar inativos
          </label>
          <button className="secondary" disabled={loading} onClick={() => setReload((n) => n + 1)}>
            Atualizar
          </button>
        </div>
        {filtered.length ? (
          <div className="draft-cards">
            {filtered.map((r) => (
              <article key={r.id}>
                <span className="status">{r.active ? "Ativo" : "Inativo"}</span>
                <h3>{r.name}</h3>
                <p>{r.document}</p>
                <small>
                  {r.city} {r.state}
                </small>
                <button
                  className="secondary"
                  disabled={loading}
                  onClick={() => {
                    setCustomer(r);
                    setError("");
                    setEditing(true);
                  }}
                >
                  Editar cliente
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">
            <p>{loading ? "Consultando clientes…" : "Nenhum cliente encontrado."}</p>
          </div>
        )}
        <div className="banner">
          Dados declarados, sem consulta cadastral externa e sem sincronização automática com o
          FazNota. Clientes de outra transportadora não aparecem nesta base.
        </div>
      </section>
      {editing && (
        <div className="overlay">
          <section
            className="dialog company-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-title"
          >
            <button
              className="close"
              disabled={busy}
              aria-label="Fechar cliente"
              onClick={() => setEditing(false)}
            >
              <X />
            </button>
            <h2 id="customer-title">{customer ? "Editar" : "Cadastrar"} cliente</h2>
            {error && (
              <div className="notice" role="alert">
                {error}
              </div>
            )}
            <form onSubmit={save}>
              <fieldset disabled={busy} className="wizard-fields">
                <div className="wizard-grid">
                  {(
                    [
                      ["name", "Nome / razão social", 160],
                      ["document", "CPF/CNPJ", 18],
                      ["email", "E-mail", 254],
                      ["phone", "Telefone", 30],
                      ["zip_code", "CEP", 9],
                      ["street", "Logradouro", 160],
                      ["address_number", "Número", 30],
                      ["district", "Bairro", 120],
                      ["city", "Cidade", 120],
                      ["ibge_code", "Código IBGE", 7],
                    ] as const
                  ).map(([key, label, max]) => (
                    <label key={key}>
                      {label}
                      <input
                        name={key}
                        type={key === "email" ? "email" : "text"}
                        required={key === "name" || key === "document"}
                        maxLength={max}
                        defaultValue={customer?.[key] ?? ""}
                      />
                    </label>
                  ))}
                  <label>
                    UF
                    <select name="state" defaultValue={customer?.state ?? ""}>
                      <option value="">A preencher</option>
                      {states.map((uf) => (
                        <option key={uf}>{uf}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="fleet-active">
                  <input name="active" type="checkbox" defaultChecked={customer?.active ?? true} />
                  Cliente ativo
                </label>
              </fieldset>
              <button className="primary" disabled={busy}>
                {busy ? "Salvando…" : "Salvar cliente"}
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
