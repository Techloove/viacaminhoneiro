import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "../supabase";
import { fleetError, vehicleKinds, type Driver, type Vehicle, type FleetKind } from "../lib/fleet";
import type { FreightDraft } from "../lib/freight-draft";
import { FleetEditor } from "./fleet-registry";
export default function FleetPicker({
  organizationId,
  draft,
  onApply,
}: {
  organizationId: string | null;
  draft: FreightDraft;
  onApply: (data: Partial<FreightDraft>) => void;
}) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [editor, setEditor] = useState<FleetKind | null>(null);
  const [message, setMessage] = useState("");
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
        .eq("active", true)
        .order("name")
        .limit(1000),
      supabase
        .from("carrier_vehicles")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("active", true)
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
  function applyDriver(d: Driver) {
    onApply({ driver: d.name, driverDocument: d.cpf });
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    setMessage(
      d.license_expiry && d.license_expiry < today
        ? "Motorista preenchido. A validade de CNH informada está vencida; confira antes de usar na operação."
        : "Motorista preenchido no rascunho. Habilitação não verificada externamente.",
    );
  }
  function applyVehicle(v: Vehicle) {
    if (v.kind === "trailer") {
      const power = vehicles.find((x) => x.plate === draft.plate && x.kind !== "trailer");
      onApply({ trailer: v.plate, axles: power ? String(power.axles + v.axles) : "" });
    } else {
      const trailer = vehicles.find((x) => x.plate === draft.trailer && x.kind === "trailer");
      onApply({
        plate: v.plate,
        axles: draft.trailer && !trailer ? "" : String(v.axles + (trailer?.axles ?? 0)),
      });
    }
    setMessage(
      "Veículo preenchido. Confira a composição e o total de eixos; dados manuais ou implementos adicionais exigem revisão.",
    );
  }
  const powers = vehicles.filter((v) => v.active && v.kind !== "trailer");
  const trailers = vehicles.filter((v) => v.active && v.kind === "trailer");
  return (
    <div className="fleet-picker">
      <div className="section-title">
        <div>
          <h3>Preencher com cadastros da transportadora</h3>
          <p>Selecione abaixo para copiar os dados. Você pode revisá-los nos campos da viagem.</p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={loading}
          onClick={() => setReload((n) => n + 1)}
        >
          {loading ? "Carregando…" : "Atualizar cadastros"}
        </button>
      </div>
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      <div className="wizard-grid">
        <label>
          Selecionar motorista cadastrado
          <select
            defaultValue=""
            onChange={(e) => {
              const row = drivers.find((d) => d.id === e.target.value && d.active);
              if (row) applyDriver(row);
              e.target.value = "";
            }}
          >
            <option value="">Selecione para preencher</option>
            {drivers
              .filter((d) => d.active)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · CPF final {d.cpf.slice(-4)}
                </option>
              ))}
          </select>
        </label>
        <label>
          Selecionar veículo de tração
          <select
            defaultValue=""
            onChange={(e) => {
              const row = powers.find((v) => v.id === e.target.value);
              if (row) applyVehicle(row);
              e.target.value = "";
            }}
          >
            <option value="">Selecione para preencher</option>
            {powers.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate} · {vehicleKinds[v.kind]} · {v.axles} eixos
              </option>
            ))}
          </select>
        </label>
        <label>
          Selecionar implemento cadastrado
          <select
            defaultValue=""
            onChange={(e) => {
              const row = trailers.find((v) => v.id === e.target.value);
              if (row) applyVehicle(row);
              e.target.value = "";
            }}
          >
            <option value="">Selecione para preencher</option>
            {trailers.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate} · {v.axles} eixos
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="fleet-quick-actions">
        <button
          type="button"
          className="secondary"
          disabled={loading}
          onClick={() => setEditor("driver")}
        >
          <Plus size={15} />
          Cadastrar motorista aqui
        </button>
        <button
          type="button"
          className="secondary"
          disabled={loading}
          onClick={() => setEditor("vehicle")}
        >
          <Plus size={15} />
          Cadastrar veículo aqui
        </button>
      </div>
      <p className="hint">
        Somente ativos aparecem nas seleções, até 1.000 registros por categoria. Alterações futuras
        no cadastro não modificam esta cópia no rascunho.
      </p>
      {editor && (
        <FleetEditor
          kind={editor}
          organizationId={organizationId}
          onClose={() => setEditor(null)}
          onSaved={(result) => {
            if (result.kind === "driver") {
              setDrivers((old) => [result.row, ...old.filter((r) => r.id !== result.row.id)]);
              if (result.row.active) applyDriver(result.row);
            } else {
              setVehicles((old) => [result.row, ...old.filter((r) => r.id !== result.row.id)]);
              if (result.row.active) applyVehicle(result.row);
            }
            if (!result.row.active)
              setMessage("Cadastro salvo como inativo. Ative-o para novas seleções.");
            setEditor(null);
          }}
        />
      )}
    </div>
  );
}
