import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CheckCircle2,
  FileText,
  Plus,
  Save,
  Search,
  X,
} from "lucide-react";
import { tripPlanningIssues, tripPlanError, type ConversionResult } from "../lib/trip-planning";
import CustomerPicker from "./customer-picker";
import FleetPicker from "./fleet-picker";
import { supabase } from "../supabase";
import {
  emptyFreightDraft,
  freightDraftSchema,
  preparationIssues,
  wizardSteps,
  type FreightDraft,
  type DraftRow,
} from "../lib/freight-draft";
import type { CarrierProfile, ReceivedNote } from "./carrier-operation";
type Props = {
  organizationId: string | null;
  notes: ReceivedNote[];
  profile: CarrierProfile | null;
  onImport: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onTripCreated?: (tripId: string) => void;
};
function explain(error: { message: string; code?: string }) {
  return ["PGRST205", "42P01", "PGRST202", "42883"].includes(error.code ?? "")
    ? "Aplique a migração 202610210003_freight_drafts.sql no Supabase para habilitar os rascunhos."
    : error.message;
}
export default function FreightAssistant({
  organizationId,
  notes,
  profile,
  onImport,
  onDirtyChange,
  onTripCreated,
}: Props) {
  const [draft, setDraft] = useState<FreightDraft>(emptyFreightDraft);
  const [id, setId] = useState("");
  const [revision, setRevision] = useState(0);
  const [step, setStep] = useState(0);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [saveFeedback, setSaveFeedback] = useState<{
    kind: "idle" | "saving" | "saved" | "error";
    time?: string;
    text?: string;
  }>({ kind: "idle" });
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const load = useCallback(async () => {
    if (!supabase || !organizationId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("freight_drafts")
        .select("id,organization_id,payload,revision,current_step,updated_at")
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      setRows((data ?? []).map((r) => ({ ...r, payload: freightDraftSchema.parse(r.payload) })));
    } catch (e) {
      setMessage(explain(e as { message: string; code?: string }));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);
  useEffect(() => {
    let active = true;
    if (!supabase || !organizationId) return;
    setLoading(true);
    supabase
      .from("freight_drafts")
      .select("id,organization_id,payload,revision,current_step,updated_at")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setMessage(explain(error));
        else {
          try {
            setRows(
              (data ?? []).map((r) => ({ ...r, payload: freightDraftSchema.parse(r.payload) })),
            );
          } catch {
            setMessage("Há um rascunho incompatível. Nenhum dado foi sobrescrito.");
          }
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [organizationId]);
  const note = notes.find((n) => n.key === selected);
  const match = !!note?.carrierCnpj && !!profile?.cnpj && note.carrierCnpj === profile.cnpj;
  const issues = preparationIssues(draft);
  const planningIssues = tripPlanningIssues(draft);
  function change<K extends keyof FreightDraft>(key: K, value: FreightDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
    setSaveFeedback({ kind: "idle" });
    setMessage("");
  }
  function canLeave() {
    return !dirty || window.confirm("Há alterações não salvas. Deseja descartá-las?");
  }
  function begin(n?: ReceivedNote) {
    if (!canLeave()) return;
    setDraft({
      ...emptyFreightDraft(),
      invoiceKey: n?.key ?? "",
      invoiceNumber: n?.number ?? "",
      carrierCnpj: n?.carrierCnpj ?? "",
      sender: n?.issuer ?? "",
      recipient: n?.recipient ?? "",
      origin: n?.origin ?? "",
      destination: n?.destination ?? "",
      cargo: n?.cargo ?? "",
      weightKg: n?.weightKg ?? "",
      cargoValue: n?.cargoValue ?? "",
    });
    setId(crypto.randomUUID());
    setRevision(0);
    setStep(0);
    setEditing(true);
    setDirty(true);
    setSaveFeedback({ kind: "idle" });
    setMessage("");
  }
  function resume(row: DraftRow) {
    if (!canLeave()) return;
    setDraft(row.payload);
    setId(row.id);
    setRevision(row.revision);
    setStep(row.current_step);
    setEditing(true);
    setDirty(false);
    setSaveFeedback({ kind: "idle" });
    setMessage("Rascunho reaberto. Nenhuma emissão fiscal foi realizada.");
  }
  async function save() {
    if (busy) return;
    setBusy(true);
    setSaveFeedback({ kind: "saving" });
    setMessage("");
    try {
      const payload = freightDraftSchema.parse(draft);
      let row: DraftRow;
      if (supabase) {
        if (!organizationId) throw Error("Entre e selecione sua transportadora.");
        const { data, error } = await supabase.rpc("save_freight_draft", {
          p_id: id,
          p_organization_id: organizationId,
          p_payload: payload,
          p_current_step: step,
          p_expected_revision: revision,
        });
        if (error) throw error;
        row = data as DraftRow;
        if (!row || row.id !== id || !Number.isInteger(row.revision))
          throw Error(
            "Não foi possível confirmar a gravação do rascunho. Recarregue a lista antes de tentar novamente.",
          );
      } else {
        row = {
          id,
          organization_id: "demo",
          payload,
          revision: revision + 1,
          current_step: step,
          updated_at: new Date().toISOString(),
        };
      }
      setRows((old) => [row, ...old.filter((r) => r.id !== id)]);
      setRevision(row.revision);
      setDirty(false);
      setSaveFeedback({ kind: "saved", time: new Date().toLocaleTimeString("pt-BR") });
      setMessage(
        supabase
          ? "Rascunho salvo na transportadora. Você pode retomá-lo depois."
          : "Rascunho temporário: será perdido ao recarregar.",
      );
    } catch (e) {
      const errorText = explain(e as { message: string; code?: string });
      setMessage(errorText);
      setSaveFeedback({ kind: "error", text: errorText });
    } finally {
      setBusy(false);
    }
  }
  async function createPlanningTrip() {
    if (busy || dirty || revision < 1 || planningIssues.length || !supabase || !organizationId)
      return;
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await supabase.rpc("create_trip_from_draft", {
        p_draft_id: id,
        p_organization_id: organizationId,
        p_expected_revision: revision,
      });
      if (error) throw error;
      const result = data as ConversionResult;
      if (
        !result ||
        typeof result.trip_id !== "string" ||
        !result.trip_id ||
        typeof result.created !== "boolean" ||
        !Number.isInteger(result.source_revision)
      )
        throw Error(
          "Não foi possível confirmar a criação. Reabra o rascunho e tente novamente; a mesma operação não deve gerar outra viagem.",
        );
      setMessage(
        result.created
          ? "Viagem de planejamento criada. Nenhuma emissão fiscal foi realizada."
          : "Esta operação já possui uma viagem. A cópia existente foi preservada.",
      );
      onTripCreated?.(result.trip_id);
    } catch (error) {
      setMessage(tripPlanError(error as { message: string; code?: string }));
    } finally {
      setBusy(false);
    }
  }
  function go(next: number) {
    setStep(next);
    setDirty(true);
    setSaveFeedback({ kind: "idle" });
    setMessage("");
  }
  const field = (
    key: keyof FreightDraft,
    label: string,
    options: { type?: string; placeholder?: string; maxLength?: number } = {},
  ) => (
    <label>
      {label}
      <input
        type={options.type ?? "text"}
        min={options.type === "number" ? "0" : undefined}
        step={options.type === "number" ? "any" : undefined}
        value={String(draft[key])}
        maxLength={options.maxLength ?? (options.type === "number" ? 20 : 160)}
        placeholder={options.placeholder}
        onChange={(e) => change(key, e.target.value)}
      />
    </label>
  );
  const filtered = rows.filter((r) =>
    [r.payload.reference, r.payload.origin, r.payload.destination, r.payload.invoiceKey]
      .join(" ")
      .toLocaleLowerCase("pt-BR")
      .includes(query.toLocaleLowerCase("pt-BR")),
  );
  return (
    <div className="freight-assistant">
      <section className="panel">
        <div className="section-title">
          <div>
            <span className="eyebrow">ASSISTENTE DA TRANSPORTADORA</span>
            <h2>Organize o frete, uma etapa por vez.</h2>
            <p>NF-e → preparação do CT-e → CIOT quando aplicável → MDF-e.</p>
          </div>
          <button className="primary" onClick={() => begin()} disabled={busy}>
            <Plus size={16} />
            Nova operação
          </button>
        </div>
        <div className="banner">
          Preparação sem transmissão fiscal. Revise os dados importados e salve seu progresso.
          Nenhum rascunho é uma autorização para iniciar a viagem.
        </div>
      </section>
      {message && (
        <div className="notice" role="status">
          {message}
          <button aria-label="Fechar aviso da operação" onClick={() => setMessage("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {editing && (
        <section className="panel wizard" aria-label="Assistente de operação">
          <div className="section-title">
            <div>
              <h2>{draft.reference || "Nova operação"}</h2>
              <p>
                {dirty ? "Alterações não salvas" : `Versão salva ${revision}`} · Rascunho · Nenhuma
                transmissão
              </p>
            </div>
            <div className="wizard-header-actions">
              <button
                className="primary"
                onClick={() => void save()}
                disabled={busy || (!dirty && revision > 0)}
              >
                <Save size={15} />
                {saveFeedback.kind === "saving"
                  ? "Salvando progresso…"
                  : saveFeedback.kind === "saved" && !dirty
                    ? "Progresso salvo"
                    : "Salvar progresso"}
              </button>
              <button
                className="icon"
                aria-label="Fechar assistente"
                disabled={busy}
                onClick={() => {
                  if (canLeave()) {
                    setEditing(false);
                    setDirty(false);
                  }
                }}
              >
                <X />
              </button>
            </div>
          </div>
          <div className="banner">
            Pode salvar agora, mesmo sem todos os dados. As pendências servem para orientar a
            revisão e não bloqueiam o rascunho. Complete depois em “Retomar uma operação”.
          </div>
          <nav className="wizard-nav" aria-label="Etapas da operação">
            {wizardSteps.map((label, i) => (
              <button
                key={label}
                aria-current={step === i ? "step" : undefined}
                disabled={busy}
                onClick={() => go(i)}
              >
                <span>{i + 1}</span>
                {label}
              </button>
            ))}
          </nav>
          <fieldset disabled={busy} className="wizard-fields">
            <legend className="sr-only">{wizardSteps[step]}</legend>
            {step === 0 && (
              <>
                <h3>Comece pela carga</h3>
                <p>Dados do XML são sugestões para revisão; não validam a situação da NF-e.</p>
                <div className="wizard-grid">
                  {field("reference", "Referência da operação", {
                    placeholder: "Ex.: FRETE-2026-001",
                    maxLength: 100,
                  })}
                  {field("invoiceKey", "Chave da NF-e", { maxLength: 44 })}
                  {field("cargo", "Carga predominante", { maxLength: 300 })}
                  {field("cargoType", "Categoria da carga")}
                  {field("weightKg", "Peso bruto (kg)", { type: "number" })}
                  {field("cargoValue", "Valor da carga (R$)", { type: "number" })}
                </div>
                <p className="hint">
                  Uma NF-e por rascunho nesta versão. O XML original ainda não é arquivado; somente
                  os dados de preparação são salvos.
                </p>
              </>
            )}
            {step === 1 && (
              <>
                <h3>Quem participa do transporte?</h3>
                <CustomerPicker
                  organizationId={organizationId}
                  onApply={(data) => {
                    setDraft((old) => ({ ...old, ...data }));
                    setDirty(true);
                    setSaveFeedback({ kind: "idle" });
                    setMessage("");
                  }}
                />
                <p>
                  Remetente, destinatário, tomador, contratante e recebedor podem ser pessoas
                  diferentes.
                </p>
                <div className="wizard-grid">
                  {field("sender", "Remetente")}
                  {field("senderDocument", "CPF/CNPJ do remetente", { maxLength: 14 })}
                  {field("recipient", "Destinatário")}
                  {field("recipientDocument", "CPF/CNPJ do destinatário", { maxLength: 14 })}
                  {field("payer", "Tomador do frete")}
                  {field("payerDocument", "CPF/CNPJ do tomador", { maxLength: 14 })}
                  {field("cfop", "CFOP para revisão fiscal", { maxLength: 4 })}
                </div>
                <div className="banner">
                  O CFOP deve ser conferido pelo responsável fiscal. Não selecionamos um código
                  tributário automaticamente.
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <h3>Valores do frete</h3>
                <div className="wizard-grid">
                  {field("freight", "Frete bruto (R$)", { type: "number" })}
                  {field("toll", "Vale-pedágio previsto (R$)", { type: "number" })}
                </div>
                <div className="event-checklist">
                  <h3>Piso mínimo: não calculado</h3>
                  <p>
                    Metodologia e coeficientes vigentes ainda precisam ser integrados. O
                    preenchimento dos valores não comprova atendimento ao piso, recolhimento de
                    tributos ou pagamento do vale-pedágio.
                  </p>
                </div>
                <p>Retenções e líquido a receber não são calculados nesta etapa.</p>
              </>
            )}
            {step === 3 && (
              <>
                <h3>Viagem e preparação do CIOT</h3>
                <FleetPicker
                  organizationId={organizationId}
                  draft={draft}
                  onApply={(data) => {
                    setDraft((old) => ({ ...old, ...data }));
                    setDirty(true);
                    setSaveFeedback({ kind: "idle" });
                    setMessage("");
                  }}
                />
                <div className="wizard-grid">
                  {field("origin", "Origem", { maxLength: 120 })}
                  {field("destination", "Destino", { maxLength: 120 })}
                  {field("routeStates", "UFs do percurso em ordem", {
                    placeholder: "RS, SC, PR",
                    maxLength: 100,
                  })}
                  {field("startDate", "Início da viagem", { type: "date" })}
                  {field("endDate", "Fim previsto", { type: "date" })}
                  {field("driver", "Motorista", { maxLength: 120 })}
                  {field("driverDocument", "CPF do motorista", { maxLength: 11 })}
                  {field("plate", "Placa do veículo", { placeholder: "ABC1D23", maxLength: 7 })}
                  {field("trailer", "Placa do implemento", { maxLength: 7 })}
                  {field("axles", "Eixos da composição", { type: "number", maxLength: 2 })}
                  <label>
                    Tipo de operação
                    <select
                      value={draft.operationType}
                      onChange={(e) =>
                        change("operationType", e.target.value as FreightDraft["operationType"])
                      }
                    >
                      <option value="lotacao">Carga lotação</option>
                      <option value="fracionada">Carga fracionada</option>
                      <option value="agregado">TAC-agregado</option>
                    </select>
                  </label>
                </div>
                <div className="wizard-checks">
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.emptyReturn}
                      onChange={(e) => change("emptyReturn", e.target.checked)}
                    />
                    Retorno vazio
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.highPerformance}
                      onChange={(e) => change("highPerformance", e.target.checked)}
                    />
                    Operação de alto desempenho
                  </label>
                </div>
                <p className="hint">
                  Indicadores sujeitos às regras da operação. Eixos e demais campos serão detalhados
                  por veículo na integração.
                </p>
                <h3>Contratação e pagamento</h3>
                <div className="wizard-grid">
                  {field("contractor", "Contratante do transporte")}
                  {field("receiver", "Recebedor do frete")}
                  <label>
                    Meio de pagamento
                    <select
                      value={draft.paymentMethod}
                      onChange={(e) =>
                        change("paymentMethod", e.target.value as FreightDraft["paymentMethod"])
                      }
                    >
                      <option value="pix">Pix</option>
                      <option value="bank">Conta bancária</option>
                      <option value="other">Outro · sujeito à elegibilidade</option>
                    </select>
                  </label>
                  {field(
                    "paymentReference",
                    draft.paymentMethod === "pix"
                      ? "Chave Pix para revisão"
                      : "Identificação do pagamento",
                    { maxLength: 100 },
                  )}
                </div>
                <p className="hint">
                  Não informe senhas, tokens ou dados de cartão. Registrar dados de pagamento não
                  realiza transferência. Contratos de CIOT ainda não estão conectados.
                </p>
              </>
            )}
            {step === 4 && (
              <>
                <h3>Confira antes da integração fiscal</h3>
                <div className="review-grid">
                  {[
                    [
                      "Carga",
                      `${draft.cargo || "A preencher"} · NF-e ${draft.invoiceNumber || "sem número"}`,
                      0,
                    ],
                    [
                      "Participantes",
                      `${draft.sender || "Remetente pendente"} → ${draft.recipient || "Destinatário pendente"}`,
                      1,
                    ],
                    [
                      "Frete",
                      draft.freight
                        ? `R$ ${draft.freight} bruto · piso não calculado`
                        : "Valor pendente",
                      2,
                    ],
                    [
                      "Viagem",
                      `${draft.origin || "Origem pendente"} → ${draft.destination || "Destino pendente"}`,
                      3,
                    ],
                  ].map(([title, value, index]) => (
                    <article key={String(title)}>
                      <strong>{title}</strong>
                      <p>{value}</p>
                      <button className="secondary" onClick={() => go(Number(index))}>
                        Revisar {String(title).toLowerCase()}
                      </button>
                    </article>
                  ))}
                </div>
                <div className="event-checklist">
                  <h3>
                    {issues.length
                      ? `${issues.length} pendência(s) de preparação`
                      : "Dados básicos preenchidos para revisão"}
                  </h3>
                  {issues.length ? (
                    <ul>
                      {issues.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      Isso não equivale a validação fiscal, credenciamento ou autorização do
                      transporte.
                    </p>
                  )}
                </div>
                <label>
                  Observações
                  <textarea
                    value={draft.notes}
                    maxLength={2000}
                    rows={3}
                    onChange={(e) => change("notes", e.target.value)}
                  />
                </label>
                <div className="planning-conversion">
                  <h3>Levar esta operação para Viagens</h3>
                  <p>
                    Cria uma única viagem de planejamento com uma cópia da versão salva. Repetir
                    abre a viagem existente; editar o rascunho depois não altera a cópia.
                  </p>
                  {planningIssues.length > 0 && (
                    <ul>
                      {planningIssues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  )}
                  {(dirty || revision < 1) && (
                    <p className="hint">
                      Salve o progresso antes de criar a viagem. Os demais dados fiscais podem
                      continuar pendentes.
                    </p>
                  )}
                  <button
                    className="primary"
                    onClick={() => void createPlanningTrip()}
                    disabled={
                      busy ||
                      dirty ||
                      revision < 1 ||
                      planningIssues.length > 0 ||
                      !supabase ||
                      !organizationId
                    }
                  >
                    Criar ou abrir viagem de planejamento
                  </button>
                </div>
                <div className="fiscal-locks">
                  <button className="primary" disabled>
                    Emitir CT-e · integração pendente
                  </button>
                  <button className="primary" disabled>
                    Registrar CIOT · integração pendente
                  </button>
                  <button className="primary" disabled>
                    Emitir MDF-e · pré-requisitos pendentes
                  </button>
                </div>
              </>
            )}
          </fieldset>
          <div className="wizard-footer">
            <div
              className={`save-feedback save-feedback-${saveFeedback.kind}`}
              aria-label="Resultado do salvamento"
              aria-live="polite"
              {...(saveFeedback.kind === "error" ? { role: "alert" } : {})}
            >
              {saveFeedback.kind === "saving" && (
                <>
                  <Save size={18} />
                  <span>Salvando seu progresso. Aguarde a confirmação.</span>
                </>
              )}
              {saveFeedback.kind === "saved" && !dirty && (
                <>
                  <CheckCircle2 size={20} />
                  <span>
                    <strong>
                      {supabase ? "Salvo na transportadora" : "Guardado somente nesta sessão"} às{" "}
                      {saveFeedback.time} · versão {revision}
                    </strong>
                    <small>
                      {supabase
                        ? "Você pode sair e retomar esta operação depois."
                        : "Estes dados serão perdidos ao recarregar a página."}
                    </small>
                  </span>
                </>
              )}
              {saveFeedback.kind === "error" && (
                <>
                  <X size={20} />
                  <span>
                    <strong>Salvamento não confirmado</strong>
                    <small>{saveFeedback.text} Seus campos continuam nesta tela.</small>
                  </span>
                </>
              )}
              {saveFeedback.kind === "idle" && (
                <span>
                  {dirty
                    ? "Há alterações pendentes. Salve para continuar depois."
                    : revision > 0
                      ? "Nenhuma alteração pendente para salvar."
                      : "Você pode salvar mesmo sem todos os dados."}
                </span>
              )}
            </div>
            <button
              className="secondary"
              disabled={busy || step === 0}
              onClick={() => go(step - 1)}
            >
              <ArrowLeft size={15} />
              Voltar
            </button>
            <button
              className="secondary"
              onClick={() => void save()}
              disabled={busy || (!dirty && revision > 0)}
            >
              <Save size={15} />
              {saveFeedback.kind === "saved" && !dirty
                ? "Rascunho salvo"
                : saveFeedback.kind === "saving"
                  ? "Salvando…"
                  : "Salvar rascunho"}
            </button>
            {step < 4 && (
              <button className="primary" disabled={busy} onClick={() => go(step + 1)}>
                Próxima etapa
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        </section>
      )}
      {!editing && (
        <>
          <section className="panel">
            <div className="section-title">
              <div>
                <h2>
                  <Bell size={18} />
                  Notas importadas
                </h2>
                <p>XMLs desta sessão. Captura automática não conectada.</p>
              </div>
              <button className="secondary" onClick={onImport}>
                Importar XML
              </button>
            </div>
            {notes.length === 0 ? (
              <div className="empty">
                <FileText size={30} />
                <h3>Comece com uma NF-e ou uma operação manual</h3>
                <p>Importe o XML para reaproveitar carga, participantes e cidades.</p>
              </div>
            ) : (
              <div className="note-inbox">
                {notes.map((n) => (
                  <button
                    key={n.key}
                    onClick={() => setSelected(n.key)}
                    className={selected === n.key ? "note-selected" : ""}
                  >
                    <FileText size={20} />
                    <span>
                      <strong>
                        NF-e {n.number} · {n.issuer}
                      </strong>
                      <small>
                        {n.carrierCnpj
                          ? `Transportadora no XML: ${n.carrierCnpj}`
                          : "Transportadora não identificada no XML"}
                      </small>
                    </span>
                    <ArrowRight size={16} />
                  </button>
                ))}
              </div>
            )}
            {note && (
              <div className="event-checklist">
                <h3>
                  {match ? "CNPJ compatível com o cadastro" : "Revisão de vínculo necessária"}
                </h3>
                <p>
                  Isso não comprova autenticidade ou autorização fiscal. Confira a NF-e antes de
                  emitir documentos.
                </p>
                <button className="primary" onClick={() => begin(note)}>
                  Preparar frete com esta NF-e
                </button>
                <div className="fiscal-locks">
                  <button disabled>Registrar CIOT · integração pendente</button>
                  <button disabled>Emitir MDF-e · pré-requisitos pendentes</button>
                </div>
              </div>
            )}
          </section>
          <section className="panel">
            <div className="section-title">
              <div>
                <h2>
                  <CheckCircle2 size={18} />
                  Retomar uma operação
                </h2>
                <p>
                  {supabase
                    ? "Rascunhos da transportadora atual."
                    : "Modo de demonstração: dados temporários."}{" "}
                  Até 100 mais recentes.
                </p>
              </div>
              <button className="secondary" disabled={loading} onClick={() => void load()}>
                {loading ? "Carregando…" : "Atualizar lista"}
              </button>
            </div>
            <label className="draft-search">
              <Search size={17} />
              <input
                aria-label="Buscar operação"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Busque referência, rota ou chave da NF-e"
              />
            </label>
            {filtered.length ? (
              <div className="draft-cards">
                {filtered.map((r) => (
                  <article key={r.id}>
                    <span className="status">Rascunho · Não transmitido</span>
                    <h3>{r.payload.reference || "Operação sem referência"}</h3>
                    <p>
                      {r.payload.origin || "Origem a preencher"} →{" "}
                      {r.payload.destination || "Destino a preencher"}
                    </p>
                    <small>
                      Etapa {r.current_step + 1} · versão {r.revision} ·{" "}
                      {new Date(r.updated_at).toLocaleDateString("pt-BR")}
                    </small>
                    <button className="secondary" onClick={() => resume(r)}>
                      Continuar operação
                      <ArrowRight size={15} />
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty">
                <p>
                  {loading
                    ? "Consultando rascunhos…"
                    : query
                      ? "Nenhuma operação corresponde à busca."
                      : "Nenhum rascunho carregado. Comece uma operação e salve seu progresso."}
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
