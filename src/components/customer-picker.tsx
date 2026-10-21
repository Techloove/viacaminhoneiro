import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import type { Customer } from "./customers";
import type { FreightDraft } from "../lib/freight-draft";
export default function CustomerPicker({
  organizationId,
  onApply,
}: {
  organizationId: string | null;
  onApply: (data: Partial<FreightDraft>) => void;
}) {
  const [rows, setRows] = useState<Customer[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!supabase || !organizationId) return;
    supabase
      .from("carrier_customers")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name")
      .limit(1000)
      .then(({ data, error }) => {
        if (!active) return;
        if (error)
          setError("Base de clientes indisponível. Você pode continuar preenchendo manualmente.");
        else setRows(data ?? []);
      });
    return () => {
      active = false;
    };
  }, [organizationId]);
  function apply(role: "sender" | "recipient" | "payer", row: Customer) {
    const data: Partial<FreightDraft> = { [role]: row.name, [`${role}Document`]: row.document };
    const city = [row.city, row.state].filter(Boolean).join(" / ");
    if (city && role !== "payer") data[role === "sender" ? "origin" : "destination"] = city;
    onApply(data);
  }
  return (
    <div className="fleet-picker">
      <h3>Usar a base de clientes desta empresa</h3>
      <p>Copie um cadastro para os participantes. O rascunho mantém uma cópia dos valores.</p>
      {error && <p className="hint">{error}</p>}
      <div className="wizard-grid">
        {(
          [
            ["sender", "Selecionar remetente"],
            ["recipient", "Selecionar destinatário"],
            ["payer", "Selecionar tomador"],
          ] as const
        ).map(([role, label]) => (
          <label key={role}>
            {label}
            <select
              defaultValue=""
              onChange={(e) => {
                const row = rows.find((r) => r.id === e.target.value && r.active);
                if (row) apply(role, row);
                e.target.value = "";
              }}
            >
              <option value="">Selecione para preencher</option>
              {rows
                .filter((r) => r.active)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.document}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}
