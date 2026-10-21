import { useEffect, useState } from "react";
import { Building2, Bell, FileCheck2, ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { validCnpj } from "../lib/cnpj";
import { supabase } from "../supabase";
export type CarrierProfile = {
  name: string;
  cnpj: string;
  rntrc: string;
  state_registration: string;
  email: string;
};
export type ReceivedNote = { key: string; number: string; issuer: string; carrierCnpj?: string };
export function CarrierSettings({
  organizationId,
  onChange,
}: {
  organizationId: string | null;
  onChange: (p: CarrierProfile | null) => void;
}) {
  const [profile, setProfile] = useState<CarrierProfile>({
    name: "",
    cnpj: "",
    rntrc: "",
    state_registration: "",
    email: "",
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    if (!supabase || !organizationId) return;
    supabase
      .from("carrier_profiles")
      .select("name,cnpj,rntrc,state_registration,email")
      .eq("organization_id", organizationId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setMessage(error.message);
        if (data) {
          setProfile(data);
          onChange(data);
        }
      });
    return () => {
      active = false;
    };
  }, [organizationId, onChange]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!validCnpj(profile.cnpj)) {
      setMessage("Informe um CNPJ válido, com dígitos verificadores corretos.");
      return;
    }
    setBusy(true);
    try {
      if (supabase) {
        if (!organizationId) throw Error("Entre e selecione sua transportadora.");
        const { error } = await supabase
          .from("carrier_profiles")
          .upsert(
            { ...profile, organization_id: organizationId },
            { onConflict: "organization_id" },
          );
        if (error) throw error;
      }
      onChange(profile);
      setMessage(
        supabase
          ? "Cadastro salvo na sua organização."
          : "Cadastro temporário. Os dados serão perdidos ao recarregar.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Cadastro da transportadora</h2>
            <p>Identificação da empresa que presta o serviço de frete.</p>
          </div>
          <Building2 />
        </div>
        <form className="carrier-form" onSubmit={save}>
          {(
            [
              ["name", "Razão social"],
              ["cnpj", "CNPJ"],
              ["rntrc", "RNTRC"],
              ["state_registration", "Inscrição estadual"],
              ["email", "E-mail operacional"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                required={key === "name" || key === "cnpj"}
                type={key === "email" ? "email" : "text"}
                maxLength={key === "cnpj" ? 14 : key === "rntrc" ? 9 : 160}
                value={profile[key]}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    [key]:
                      key === "cnpj" || key === "rntrc"
                        ? e.target.value.replace(/\D/g, "")
                        : e.target.value,
                  }))
                }
              />
            </label>
          ))}
          <div>
            <button className="primary" disabled={busy}>
              {busy ? "Salvando…" : "Salvar cadastro"}
            </button>
          </div>
        </form>
        {message && <p role="status">{message}</p>}
      </section>
      <section className="panel">
        <h2>Certificado e captura de NF-e</h2>
        <div className="banner">
          <LockKeyhole size={20} />
          <span>
            Certificado não conectado. O envio seguro de A1 e a custódia no servidor ainda precisam
            ser integrados. Não envie certificado ou senha por chat.
          </span>
        </div>
        <p>
          A captura deve usar distribuição de DF-e autorizada para o CNPJ da transportadora, com
          controle de NSU, intervalos de consulta e disponibilidade do XML. Citar a transportadora
          na nota não garante acesso imediato ao documento completo.
        </p>
        <div className="integration-grid">
          <article>
            <h3>Certificado digital</h3>
            <p>Aguardando configuração segura por empresa.</p>
          </article>
          <article>
            <h3>Monitoramento de NF-e</h3>
            <p>Não conectado · nenhuma consulta automática executada.</p>
          </article>
        </div>
      </section>
    </>
  );
}
export function CarrierOperation({
  notes,
  profile,
  onImport,
  onFiscal,
}: {
  notes: ReceivedNote[];
  profile: CarrierProfile | null;
  onImport: () => void;
  onFiscal: (key: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const note = notes.find((n) => n.key === selected);
  const match = !!note?.carrierCnpj && !!profile?.cnpj && note.carrierCnpj === profile.cnpj;
  return (
    <>
      <section className="panel">
        <div className="section-title">
          <div>
            <span className="eyebrow">NF-e → CT-e → CIOT → MDF-e</span>
            <h2>Da nota recebida à viagem documentada</h2>
            <p>Cada etapa depende da confirmação do serviço responsável.</p>
          </div>
          <ShieldCheck />
        </div>
        <div className="fiscal-steps">
          {["NF-e recebida", "CT-e autorizado", "CIOT registrado", "MDF-e autorizado"].map(
            (s, i) => (
              <div key={s}>
                <span>{i + 1}</span>
                <strong>{s}</strong>
                {i < 3 && <ArrowRight size={16} />}
              </div>
            ),
          )}
        </div>
        <div className="banner">
          A ordem proposta orienta a operação. A exigência de CIOT e os demais requisitos dependem
          da contratação. O registro deve ocorrer no prazo legal aplicável e antes da etapa que
          exigir seu código.
        </div>
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>
              <Bell size={18} /> Caixa de entrada de NF-e
            </h2>
            <p>
              {notes.length} XML(s) importado(s) manualmente nesta sessão. Nenhuma captura
              automática ativa.
            </p>
          </div>
          <button className="secondary" onClick={onImport}>
            Importar XML
          </button>
        </div>
        {notes.length === 0 ? (
          <div className="empty">
            <Bell size={30} />
            <h3>Aguardando suas primeiras notas</h3>
            <p>
              Conecte a captura autorizada ou importe um XML para começar.
              <br />A importação não confirma autenticidade nem autorização na SEFAZ.
            </p>
          </div>
        ) : (
          <div className="note-inbox">
            {notes.map((n) => (
              <button
                className={selected === n.key ? "note-selected" : ""}
                key={n.key}
                onClick={() => setSelected(n.key)}
              >
                <FileCheck2 size={20} />
                <span>
                  <strong>
                    NF-e {n.number} · {n.issuer}
                  </strong>
                  <small>
                    {n.carrierCnpj
                      ? `CNPJ da transportadora no XML: ${n.carrierCnpj}`
                      : "Transportadora não identificada no XML"}
                  </small>
                </span>
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        )}
      </section>
      {note && (
        <section className="panel">
          <h2>Preparar operação · NF-e {note.number}</h2>
          <p className="note-key">{note.key}</p>
          <div className="event-checklist">
            <h3>{match ? "CNPJ compatível com o cadastro" : "Revisão de vínculo necessária"}</h3>
            <p>
              {match
                ? "O CNPJ da transportadora no XML coincide com o cadastro. Isso não comprova autenticidade ou autorização fiscal."
                : "Cadastre sua transportadora e confira se ela está identificada no XML. O vínculo não foi confirmado."}
            </p>
          </div>
          <div className="operation-stage">
            <strong>1. CT-e</strong>
            <p>Aguardando revisão fiscal, contrato completo e autorização do provedor.</p>
            <button className="secondary" onClick={() => onFiscal(note.key)}>
              Abrir preparação fiscal
            </button>
          </div>
          <div className="operation-stage">
            <strong>2. CIOT</strong>
            <p>
              Depende de acesso autorizado, enquadramento da operação e dados de contratação.
              Contrato técnico ANTT identificado; serviço não conectado.
            </p>
            <button className="primary" disabled>
              Registrar CIOT · integração pendente
            </button>
          </div>
          <div className="operation-stage">
            <strong>3. MDF-e</strong>
            <p>
              Vincular as chaves dos CT-e autorizados e as informações do CIOT quando exigidas.
              Nenhum documento anterior confirmado nesta versão.
            </p>
            <button className="primary" disabled>
              Emitir MDF-e · pré-requisitos pendentes
            </button>
          </div>
        </section>
      )}
    </>
  );
}
