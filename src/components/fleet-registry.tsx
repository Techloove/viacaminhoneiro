import { useEffect, useState } from "react";
import { Plus, Search, Truck, UserRound, X } from "lucide-react";
import { supabase } from "../supabase";
import { validCnpj } from "../lib/cnpj";
import {
  fleetError,
  validCpf,
  vehicleKinds,
  type Driver,
  type Vehicle,
  type FleetKind,
} from "../lib/fleet";
type Result = { kind: "driver"; row: Driver } | { kind: "vehicle"; row: Vehicle };
export function FleetEditor({
  kind,
  organizationId,
  record,
  onClose,
  onSaved,
}: {
  kind: FleetKind;
  organizationId: string | null;
  record?: Driver | Vehicle | null;
  onClose: () => void;
  onSaved: (result: Result) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const driver = record && "cpf" in record ? record : null;
  const vehicle = record && "plate" in record ? record : null;
  const close = () => {
    if (!busy && (!dirty || window.confirm("Descartar as alterações deste cadastro?"))) onClose();
  };
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setMessage("");
    const f = new FormData(e.currentTarget);
    const get = (name: string) => String(f.get(name) ?? "").trim();
    const digits = (name: string) => get(name).replace(/\D/g, "");
    let payload;
    if (kind === "driver") {
      if (!validCpf(digits("cpf"))) {
        setMessage("Confira o CPF do motorista: os dígitos verificadores não são válidos.");
        return;
      }
      if (digits("license_number") && !/^\d{11}$/.test(digits("license_number"))) {
        setMessage("A CNH deve ter 11 dígitos ou ficar em branco.");
        return;
      }
      payload = {
        name: get("name"),
        cpf: digits("cpf"),
        license_number: digits("license_number"),
        license_expiry: get("license_expiry") || null,
        phone: get("phone"),
        active: f.get("active") === "on",
      };
    } else {
      const plate = get("plate").toUpperCase().replace(/[-\s]/g, "");
      if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)) {
        setMessage("Confira a placa: ABC1234 ou ABC1D23.");
        return;
      }
      if (digits("rntrc") && !/^\d{9}$/.test(digits("rntrc"))) {
        setMessage("O RNTRC deve ter 9 dígitos ou ficar em branco.");
        return;
      }
      const owner = digits("owner_document");
      if (owner && !validCpf(owner) && !validCnpj(owner)) {
        setMessage("Confira o CPF/CNPJ do proprietário.");
        return;
      }
      const axles = Number(get("axles"));
      if (!Number.isInteger(axles) || axles < 1 || axles > 10) {
        setMessage("Informe de 1 a 10 eixos. A compatibilidade será conferida por operação.");
        return;
      }
      payload = {
        plate,
        kind: get("kind"),
        axles,
        rntrc: digits("rntrc"),
        owner_name: get("owner_name"),
        owner_document: owner,
        description: get("description"),
        active: f.get("active") === "on",
      };
    }
    setBusy(true);
    try {
      let row;
      if (supabase) {
        if (!organizationId) throw Error("Entre e selecione sua transportadora.");
        const table = kind === "driver" ? "carrier_drivers" : "carrier_vehicles";
        const q = record
          ? supabase
              .from(table)
              .update(payload)
              .eq("id", record.id)
              .eq("organization_id", organizationId)
          : supabase.from(table).insert({ ...payload, organization_id: organizationId });
        const { data, error } = await q.select().single();
        if (error) throw error;
        row = data;
      } else row = { ...payload, id: record?.id ?? crypto.randomUUID(), organization_id: "demo" };
      onSaved(kind === "driver" ? { kind, row: row as Driver } : { kind, row: row as Vehicle });
    } catch (e) {
      setMessage(fleetError(e as { message: string; code?: string }));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="overlay">
      <section
        className="dialog fleet-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fleet-editor-title"
      >
        <button
          className="close"
          type="button"
          aria-label="Fechar cadastro"
          disabled={busy}
          onClick={close}
        >
          <X />
        </button>
        <span className="eyebrow">CADASTRO DA TRANSPORTADORA</span>
        <h2 id="fleet-editor-title">
          {record ? "Editar" : "Cadastrar"} {kind === "driver" ? "motorista" : "veículo"}
        </h2>
        <p>Dados reutilizáveis nos próximos fretes. Nenhuma validação externa é realizada.</p>
        {message && (
          <div className="notice" role="alert">
            {message}
          </div>
        )}
        <form onSubmit={save} onChange={() => setDirty(true)}>
          <fieldset disabled={busy} className="wizard-fields">
            <div className="wizard-grid">
              {kind === "driver" ? (
                <>
                  <label>
                    Nome do motorista
                    <input name="name" required maxLength={120} defaultValue={driver?.name} />
                  </label>
                  <label>
                    CPF
                    <input
                      name="cpf"
                      required
                      maxLength={14}
                      inputMode="numeric"
                      defaultValue={driver?.cpf}
                    />
                  </label>
                  <label>
                    Número da CNH
                    <input
                      name="license_number"
                      maxLength={11}
                      inputMode="numeric"
                      defaultValue={driver?.license_number}
                    />
                  </label>
                  <label>
                    Validade da CNH
                    <input
                      name="license_expiry"
                      type="date"
                      defaultValue={driver?.license_expiry ?? ""}
                    />
                  </label>
                  <label>
                    Telefone
                    <input name="phone" type="tel" maxLength={30} defaultValue={driver?.phone} />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Placa
                    <input
                      name="plate"
                      required
                      maxLength={8}
                      defaultValue={vehicle?.plate}
                      placeholder="ABC1D23"
                    />
                  </label>
                  <label>
                    Tipo de veículo
                    <select name="kind" defaultValue={vehicle?.kind ?? "truck"}>
                      {Object.entries(vehicleKinds).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Número de eixos
                    <input
                      name="axles"
                      type="number"
                      min={1}
                      max={10}
                      step={1}
                      required
                      defaultValue={vehicle?.axles ?? 2}
                    />
                  </label>
                  <label>
                    RNTRC
                    <input
                      name="rntrc"
                      maxLength={9}
                      inputMode="numeric"
                      defaultValue={vehicle?.rntrc}
                    />
                  </label>
                  <label>
                    Proprietário
                    <input name="owner_name" maxLength={160} defaultValue={vehicle?.owner_name} />
                  </label>
                  <label>
                    CPF/CNPJ do proprietário
                    <input
                      name="owner_document"
                      maxLength={18}
                      defaultValue={vehicle?.owner_document}
                    />
                  </label>
                  <label>
                    Descrição
                    <input
                      name="description"
                      maxLength={160}
                      defaultValue={vehicle?.description}
                      placeholder="Modelo ou identificação interna"
                    />
                  </label>
                </>
              )}
            </div>
            <label className="fleet-active">
              <input name="active" type="checkbox" defaultChecked={record?.active ?? true} />
              Cadastro ativo para novas operações
            </label>
          </fieldset>
          <p className="hint">
            Inativar impede novas seleções, sem apagar dados já salvos nos rascunhos.
          </p>
          <button className="primary" disabled={busy}>
            {busy ? "Salvando cadastro…" : "Salvar cadastro"}
          </button>
        </form>
      </section>
    </div>
  );
}
export default function FleetRegistry({ organizationId }: { organizationId: string | null }) {
  const [tab, setTab] = useState<FleetKind>("driver");
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [editing, setEditing] = useState(false);
  const [record, setRecord] = useState<Driver | Vehicle | null>(null);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(Boolean(supabase && organizationId));
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    if (!supabase || !organizationId) return;
    setLoading(true);
    setMessage("");
    Promise.all([
      supabase
        .from("carrier_drivers")
        .select("*")
        .eq("organization_id", organizationId)
        .order("name")
        .limit(1000),
      supabase
        .from("carrier_vehicles")
        .select("*")
        .eq("organization_id", organizationId)
        .order("plate")
        .limit(1000),
    ]).then(([d, v]) => {
      if (!active) return;
      if (d.error || v.error) setMessage(fleetError(d.error ?? v.error!));
      setDrivers(d.data ?? []);
      setVehicles(v.data ?? []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [organizationId, reload]);
  const records = (tab === "driver" ? drivers : vehicles).filter(
    (r) =>
      (includeInactive || r.active) &&
      JSON.stringify(r).toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")),
  );
  return (
    <>
      <section className="panel">
        <div className="section-title">
          <div>
            <span className="eyebrow">MENOS DIGITAÇÃO EM CADA VIAGEM</span>
            <h2>Motoristas e veículos</h2>
            <p>
              Cadastre uma vez e selecione no assistente de frete. Até 1.000 registros por
              categoria.
            </p>
          </div>
          <button
            className="primary"
            disabled={loading}
            onClick={() => {
              setRecord(null);
              setEditing(true);
            }}
          >
            <Plus size={16} />
            Cadastrar {tab === "driver" ? "motorista" : "veículo"}
          </button>
        </div>
        <div className="fiscal-tabs" role="tablist" aria-label="Cadastros da frota">
          <button
            role="tab"
            aria-selected={tab === "driver"}
            onClick={() => {
              setTab("driver");
              setQuery("");
            }}
          >
            <UserRound size={17} />
            Motoristas
          </button>
          <button
            role="tab"
            aria-selected={tab === "vehicle"}
            onClick={() => {
              setTab("vehicle");
              setQuery("");
            }}
          >
            <Truck size={17} />
            Veículos
          </button>
        </div>
        {message && (
          <div className="notice" role="status">
            {message}
          </div>
        )}
        <div className="registry-filters">
          <label className="draft-search">
            <Search size={17} />
            <input
              aria-label="Buscar cadastro"
              placeholder="Busque nome, CPF ou placa"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="fleet-active">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Mostrar inativos
          </label>
          <button className="secondary" disabled={loading} onClick={() => setReload((n) => n + 1)}>
            {loading ? "Carregando…" : "Atualizar"}
          </button>
        </div>
        {records.length ? (
          <div className="draft-cards">
            {records.map((r) => (
              <article key={r.id}>
                <span className="status">{r.active ? "Ativo" : "Inativo"}</span>
                {"cpf" in r ? (
                  <>
                    <h3>{r.name}</h3>
                    <p>CPF final {r.cpf.slice(-4)}</p>
                    <small>
                      {r.license_expiry
                        ? `CNH: validade informada ${r.license_expiry.split("-").reverse().join("/")}`
                        : "Validade da CNH não informada"}
                    </small>
                  </>
                ) : (
                  <>
                    <h3>{r.plate}</h3>
                    <p>
                      {vehicleKinds[r.kind]} · {r.axles} eixos
                    </p>
                    <small>{r.description || "Sem descrição"}</small>
                  </>
                )}
                <button
                  className="secondary"
                  onClick={() => {
                    setRecord(r);
                    setEditing(true);
                  }}
                >
                  Editar cadastro
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">
            <p>
              {loading
                ? "Consultando cadastros…"
                : query
                  ? "Nenhum cadastro corresponde à busca."
                  : "Nenhum cadastro disponível. Cadastre o primeiro para reutilizar nas operações."}
            </p>
          </div>
        )}
        <div className="banner">
          CPF/CNPJ e formato dos campos são conferidos localmente. Situação do RNTRC, vínculo do
          veículo, habilitação e validade documental não foram consultados nos órgãos responsáveis.
        </div>
      </section>
      {editing && (
        <FleetEditor
          kind={tab}
          organizationId={organizationId}
          record={record}
          onClose={() => setEditing(false)}
          onSaved={(r) => {
            if (r.kind === "driver")
              setDrivers((old) => [r.row, ...old.filter((x) => x.id !== r.row.id)]);
            else setVehicles((old) => [r.row, ...old.filter((x) => x.id !== r.row.id)]);
            setEditing(false);
            setMessage(
              supabase
                ? "Cadastro salvo na transportadora."
                : "Cadastro temporário em modo de demonstração.",
            );
          }}
        />
      )}
    </>
  );
}
