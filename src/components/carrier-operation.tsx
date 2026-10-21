import { useEffect, useState } from "react";
import { Building2, LockKeyhole } from "lucide-react";
import FreightAssistant from "./freight-assistant";
import { validCnpj } from "../lib/cnpj";
import { supabase } from "../supabase";
export type CarrierProfile = {
  name: string;
  cnpj: string;
  rntrc: string;
  state_registration: string;
  email: string;
};
export type ReceivedNote = {
  key: string;
  number: string;
  issuer: string;
  carrierCnpj?: string;
  recipient?: string;
  origin?: string;
  destination?: string;
  cargo?: string;
  weightKg?: string;
  cargoValue?: string;
};
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
  organizationId = null,
  onDirtyChange,
}: {
  notes: ReceivedNote[];
  profile: CarrierProfile | null;
  onImport: () => void;
  organizationId?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
  onFiscal?: (key: string) => void;
}) {
  return (
    <FreightAssistant
      notes={notes}
      profile={profile}
      onImport={onImport}
      organizationId={organizationId}
      {...(onDirtyChange ? { onDirtyChange } : {})}
    />
  );
}
