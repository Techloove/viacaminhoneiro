import { useState } from "react";
import { FileCheck2, ListChecks, Plus, Settings2, X, AlertCircle, ArrowRight } from "lucide-react";
type Trip = { id: string; origin: string; destination: string; plate: string };
type Draft = {
  id: string;
  kind: string;
  reference: string;
  tripId: string;
  issuer: string;
  payer: string;
  origin: string;
  destination: string;
  plate: string;
  keys: string;
  freight: string;
  createdAt: string;
};
const tabs = ["Preparar documentos", "Acompanhamento", "Eventos", "Integração"] as const;
const capabilities = [
  [
    "CT-e",
    "Emissão, cancelamento, carta de correção e eventos de entrega",
    "Contrato parcial: faltam campos completos e consulta do recibo.",
  ],
  [
    "MDF-e",
    "Emissão, encerramento, cancelamento e inclusão de condutor/DF-e",
    "Contrato parcial: faltam campos completos e consulta do recibo.",
  ],
  [
    "NF-e recebida",
    "Listagem e manifestação do destinatário",
    "Não comprova captura irrestrita por chave de acesso.",
  ],
  [
    "CIOT",
    "Registro e conclusão da operação de transporte",
    "Nenhuma rota identificada no contrato anexado.",
  ],
];
export default function FiscalWorkspace({
  trips,
  initialKeys = "",
}: {
  trips: Trip[];
  initialKeys?: string;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Preparar documentos");
  const [kind, setKind] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [message, setMessage] = useState("");
  const [tripId, setTripId] = useState("");
  const [event, setEvent] = useState("Encerramento de MDF-e");
  const trip = trips.find((t) => t.id === tripId);
  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    const keys = get("keys")
      .split(/[\s,;]+/)
      .filter(Boolean);
    if (keys.some((k) => !/^\d{44}$/.test(k))) {
      setMessage("Cada chave de NF-e deve conter 44 dígitos.");
      return;
    }
    const cents = Number(get("freight"));
    if (!Number.isFinite(cents) || cents < 0) {
      setMessage("Confira o valor bruto do frete.");
      return;
    }
    if (drafts.some((d) => d.reference === get("reference") && d.kind === kind)) {
      setMessage("Já existe um rascunho deste tipo com essa referência nesta sessão.");
      return;
    }
    setDrafts((d) => [
      ...d,
      {
        id: crypto.randomUUID(),
        kind: kind!,
        reference: get("reference"),
        tripId,
        issuer: get("issuer"),
        payer: get("payer"),
        origin: get("origin"),
        destination: get("destination"),
        plate: get("plate"),
        keys: keys.join("\n"),
        freight: get("freight"),
        createdAt: new Date().toISOString(),
      },
    ]);
    setKind(null);
    setMessage("Rascunho preparado nesta sessão. Nenhum pedido foi enviado ao FazNota.");
  }
  return (
    <section className="fiscal-workspace">
      <div className="fiscal-heading">
        <div>
          <span className="eyebrow">CENTRAL FISCAL</span>
          <h2>Os documentos acompanham a viagem.</h2>
          <p>Prepare informações, confira pendências e organize as próximas ações.</p>
        </div>
        <FileCheck2 size={38} />
      </div>
      <div className="banner">
        <AlertCircle size={20} />
        <span>
          <strong>Integração ainda não conectada.</strong> Rascunhos ficam somente nesta sessão e
          são perdidos ao recarregar. Não há emissão, consulta externa ou autorização fiscal nesta
          tela.
        </span>
      </div>
      <div className="fiscal-tabs" role="tablist" aria-label="Central fiscal">
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {message && (
        <div className="notice" role="status">
          {message}
          <button onClick={() => setMessage("")} aria-label="Fechar aviso fiscal">
            <X size={16} />
          </button>
        </div>
      )}
      {tab === "Preparar documentos" && (
        <>
          <div className="fiscal-cards">
            {[
              [
                "CT-e",
                "Conhecimento de transporte",
                "Organize os dados da prestação de transporte.",
              ],
              [
                "MDF-e",
                "Manifesto de documentos",
                "Reúna percurso, veículo e documentos da carga.",
              ],
            ].map(([type, title, description]) => (
              <article className="panel" key={type}>
                <span className="fiscal-type">{type}</span>
                <h3>{title}</h3>
                <p>{description}</p>
                <button
                  className="secondary"
                  onClick={() => {
                    setTripId("");
                    setKind(type!);
                  }}
                >
                  <Plus size={16} />
                  Preparar {type}
                </button>
              </article>
            ))}
          </div>
          <section className="panel">
            <div className="section-title">
              <div>
                <h2>Rascunhos fiscais</h2>
                <p>
                  Informações preparatórias. A validação fiscal completa ainda não está disponível.
                </p>
              </div>
              <span className="count">{drafts.length} rascunhos</span>
            </div>
            {drafts.length === 0 ? (
              <div className="empty">
                <ListChecks size={30} />
                <h3>Comece pelos dados da sua operação</h3>
                <p>Escolha CT-e ou MDF-e para preparar um rascunho.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>DOCUMENTO</th>
                      <th>ROTA</th>
                      <th>VEÍCULO</th>
                      <th>SITUAÇÃO</th>
                      <th>AÇÃO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <strong>{d.kind}</strong>
                          <br />
                          {d.reference}
                        </td>
                        <td>
                          {d.origin}
                          <br />→ {d.destination}
                        </td>
                        <td>{d.plate || "A preencher"}</td>
                        <td>
                          <span className="status">Não enviado</span>
                        </td>
                        <td>
                          <button
                            className="secondary"
                            onClick={() => {
                              const blob = new Blob(
                                [
                                  JSON.stringify(
                                    {
                                      ...d,
                                      warning:
                                        "Rascunho interno. Não é payload homologado nem documento fiscal.",
                                    },
                                    null,
                                    2,
                                  ),
                                ],
                                { type: "application/json" },
                              );
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = `rascunho-${d.id}.json`;
                              a.click();
                              setTimeout(() => URL.revokeObjectURL(url), 1000);
                            }}
                          >
                            Exportar rascunho
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {tab === "Acompanhamento" && (
        <section className="panel">
          <h2>Da solicitação à autorização</h2>
          <p>Um recibo comprova o recebimento do pedido, não a autorização do documento.</p>
          <div className="fiscal-steps">
            {["Rascunho", "Enviado", "Processando", "Resultado confirmado"].map((s, i) => (
              <div key={s}>
                <span>{i + 1}</span>
                <strong>{s}</strong>
                {i < 3 && <ArrowRight size={16} />}
              </div>
            ))}
          </div>
          <div className="empty">
            <FileCheck2 size={30} />
            <h3>Nenhum documento transmitido</h3>
            <p>
              Recibos, protocolos, XML e documentos auxiliares serão exibidos após a integração.
              <br />
              Os rascunhos desta sessão não entram na fila de emissão.
            </p>
          </div>
        </section>
      )}
      {tab === "Eventos" && (
        <section className="panel">
          <h2>Eventos da operação</h2>
          <p>
            Selecione o evento para conferir os pré-requisitos. Nenhuma ação é transmitida nesta
            versão.
          </p>
          <label className="fiscal-field">
            Tipo de evento
            <select value={event} onChange={(e) => setEvent(e.target.value)}>
              {[
                "Encerramento de MDF-e",
                "Cancelamento de MDF-e",
                "Cancelamento de CT-e",
                "Carta de correção de CT-e",
                "Comprovante de entrega de CT-e",
                "Inclusão de condutor no MDF-e",
                "Inclusão de DF-e no MDF-e",
                "Manifestação de NF-e recebida",
              ].map((e) => (
                <option key={e}>{e}</option>
              ))}
            </select>
          </label>
          <div className="event-checklist">
            <h3>{event}</h3>
            <p>Antes de continuar, será necessário:</p>
            <ul>
              <li>Selecionar um documento da organização e confirmar sua situação no provedor.</li>
              <li>Validar dados obrigatórios, permissões e regras específicas do evento.</li>
              <li>Revisar a ação e acompanhar a confirmação do resultado.</li>
            </ul>
            <p>
              Encerrar MDF-e não encerra CIOT nem comprova quitação do frete. A manifestação da NF-e
              depende do papel e da autorização da empresa na operação.
            </p>
          </div>
          <button className="primary" disabled>
            Disponível após conectar a integração
          </button>
        </section>
      )}
      {tab === "Integração" && (
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>FazNota · API v3</h2>
              <p>Referência atual: OpenAPI oficial 3.10.0, conferido na documentação do FazNota.</p>
            </div>
            <Settings2 />
          </div>
          <div className="integration-grid">
            {capabilities.map(([title, scope, limit]) => (
              <article key={title}>
                <h3>{title}</h3>
                <p>{scope}</p>
                <small>{limit}</small>
              </article>
            ))}
          </div>
          <h3>O que falta conectar</h3>
          <ol className="requirements">
            <li>Supabase: autenticação, organizações e persistência dos dados fiscais.</li>
            <li>Backend seguro com credenciais por emissor, fila e conciliação de resultados.</li>
            <li>Contrato completo e homologação de CT-e/MDF-e com o fornecedor.</li>
            <li>Parceiro e contrato específicos para CIOT.</li>
          </ol>
          <p>
            Credenciais e certificados não devem ser enviados pelo chat nem armazenados no
            navegador.
          </p>
          <a
            className="documentation-link"
            href="https://faznota.com.br/api/v3/referencia/"
            target="_blank"
            rel="noreferrer"
          >
            Abrir documentação oficial <ArrowRight size={15} />
          </a>
        </section>
      )}
      {kind && (
        <div className="overlay">
          <section
            className="dialog fiscal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fiscal-dialog-title"
          >
            <button
              className="close"
              aria-label="Fechar rascunho fiscal"
              onClick={() => setKind(null)}
            >
              <X />
            </button>
            <span className="eyebrow">PREPARAÇÃO · SEM TRANSMISSÃO</span>
            <h2 id="fiscal-dialog-title">Preparar {kind}</h2>
            <p>
              Este formulário organiza dados básicos. Não representa o contrato completo de emissão.
            </p>
            <form onSubmit={save}>
              <label>
                Viagem relacionada
                <select value={tripId} onChange={(e) => setTripId(e.target.value)}>
                  <option value="">Preparar sem vincular viagem</option>
                  {trips.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.origin} → {t.destination}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Referência interna
                <input name="reference" required maxLength={100} placeholder="Ex.: FRETE-001" />
              </label>
              <label>
                Emitente
                <input
                  name="issuer"
                  required
                  maxLength={160}
                  placeholder="Razão social do emissor"
                />
              </label>
              {kind === "CT-e" && (
                <label>
                  Tomador do serviço
                  <input
                    name="payer"
                    required
                    maxLength={160}
                    placeholder="Quem contrata o transporte"
                  />
                </label>
              )}
              <div className="form-row" key={tripId}>
                <label>
                  Origem
                  <input name="origin" required maxLength={120} defaultValue={trip?.origin ?? ""} />
                </label>
                <label>
                  Destino
                  <input
                    name="destination"
                    required
                    maxLength={120}
                    defaultValue={trip?.destination ?? ""}
                  />
                </label>
              </div>
              <label key={`plate-${tripId}`}>
                Placa do veículo
                <input
                  name="plate"
                  required
                  maxLength={7}
                  pattern="[A-Z]{3}[0-9][A-Z0-9][0-9]{2}"
                  defaultValue={trip?.plate ?? ""}
                  placeholder="ABC1D23"
                />
              </label>
              <label>
                Chaves das NF-e
                <textarea
                  name="keys"
                  defaultValue={initialKeys}
                  rows={3}
                  placeholder="Uma chave de 44 dígitos por linha. Pode preencher depois."
                />
              </label>
              {kind === "CT-e" && (
                <label>
                  Frete bruto (R$)
                  <input
                    name="freight"
                    type="number"
                    min="0"
                    max="100000000"
                    step="0.01"
                    required
                  />
                </label>
              )}
              <div className="banner">
                Credenciamento, tributação, participantes e demais campos serão validados somente
                após completar a integração fiscal.
              </div>
              <button className="primary">Guardar rascunho nesta sessão</button>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
