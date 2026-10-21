import { useEffect, useState } from "react";
import { ArrowLeft, FileText, LockKeyhole, Route } from "lucide-react";
import { supabase } from "../supabase";
import { freightDraftSchema, preparationIssues } from "../lib/freight-draft";
import { tripPlanError, type PlanningTrip, type TripPlan } from "../lib/trip-planning";
export default function TripDetails({
  trip,
  organizationId,
  onClose,
}: {
  trip: PlanningTrip;
  organizationId: string | null;
  onClose: () => void;
}) {
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setPlan(null);
    setMessage("");
    if (!supabase || !organizationId) return;
    setLoading(true);
    supabase
      .from("trip_plans")
      .select("trip_id,organization_id,draft_id,source_revision,payload,created_at")
      .eq("organization_id", organizationId)
      .eq("trip_id", trip.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setMessage(tripPlanError(error));
        else if (data) {
          const parsed = freightDraftSchema.safeParse(data.payload);
          if (parsed.success) setPlan({ ...data, payload: parsed.data });
          else setMessage("O resumo está em formato incompatível. Nenhum dado foi alterado.");
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [trip.id, organizationId]);
  const d = plan?.payload;
  const issues = d ? preparationIssues(d) : [];
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    trip.freight_cents / 100,
  );
  return (
    <section className="panel trip-details" aria-label="Detalhes da viagem">
      <div className="section-title">
        <div>
          <span className="eyebrow">PLANEJAMENTO DA VIAGEM</span>
          <h2>{d?.reference || `${trip.origin} → ${trip.destination}`}</h2>
          <p>Rascunho · Não é autorização para iniciar o transporte.</p>
        </div>
        <button className="secondary" onClick={onClose}>
          <ArrowLeft size={15} />
          Fechar detalhes
        </button>
      </div>
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      {loading && <p>Consultando resumo da operação…</p>}
      <div className="review-grid">
        <article>
          <strong>
            <Route size={16} />
            Percurso
          </strong>
          <p>
            {trip.origin} → {trip.destination}
          </p>
          <small>
            {d?.routeStates || "UFs não informadas"}
            {d?.startDate ? ` · ${d.startDate.split("-").reverse().join("/")}` : ""}
            {d?.endDate ? ` a ${d.endDate.split("-").reverse().join("/")}` : ""}
          </small>
        </article>
        <article>
          <strong>Motorista e composição</strong>
          <p>
            {trip.driver} · {trip.plate}
          </p>
          <small>
            {d?.trailer ? `Implemento ${d.trailer} · ` : ""}
            {d?.axles ? `${d.axles} eixos informados` : "Eixos a conferir"}
          </small>
        </article>
        <article>
          <strong>Frete bruto previsto</strong>
          <p>{money}</p>
          <small>Pagamento, retenções e piso mínimo não confirmados.</small>
        </article>
        <article>
          <strong>Carga e participantes</strong>
          <p>{d?.cargo || "Descrição não vinculada"}</p>
          <small>
            {d?.sender || "Remetente a conferir"} → {d?.recipient || "Destinatário a conferir"}
          </small>
        </article>
      </div>
      {d && (
        <>
          <h3>Documentos e preparação fiscal</h3>
          <div className="document-planning-list">
            <article>
              <FileText />
              <div>
                <strong>NF-e informada</strong>
                <p className="note-key">{d.invoiceKey || "Chave ainda não preenchida"}</p>
                <small>Dados declarados no rascunho. XML e autorização não verificados.</small>
              </div>
            </article>
            {["CT-e", "CIOT", "MDF-e"].map((kind) => (
              <article key={kind}>
                <LockKeyhole />
                <div>
                  <strong>{kind}</strong>
                  <p>Integração pendente · nenhuma emissão ou autorização confirmada.</p>
                </div>
              </article>
            ))}
          </div>
          <div className="event-checklist">
            <h3>
              {issues.length
                ? `${issues.length} pendência(s) de preparação`
                : "Dados básicos disponíveis para revisão"}
            </h3>
            {issues.length ? (
              <ul>
                {issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            ) : (
              <p>A revisão básica não verifica exigências fiscais ou condições para circulação.</p>
            )}
          </div>
          <p className="hint">
            Cópia da revisão {plan.source_revision} da operação. Edições posteriores no rascunho e
            nos cadastros não atualizam esta viagem.
          </p>
          {d.notes && (
            <div className="event-checklist">
              <h3>Observações</h3>
              <p>{d.notes}</p>
            </div>
          )}
        </>
      )}
      {!loading && !plan && !message && (
        <div className="banner">
          Viagem cadastrada diretamente, sem resumo vinculado ao assistente.
        </div>
      )}
      <div className="banner">
        Planejamento separado da situação fiscal. Esta versão não libera saída, não registra entrega
        e não encerra documentos.
      </div>
    </section>
  );
}
