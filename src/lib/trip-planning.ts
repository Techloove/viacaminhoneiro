import type { FreightDraft } from "./freight-draft";
export type PlanningTrip = {
  id: string;
  origin: string;
  destination: string;
  driver: string;
  plate: string;
  freight_cents: number;
  status: string;
  organization_id?: string;
};
export type TripPlan = {
  trip_id: string;
  organization_id: string;
  draft_id: string;
  source_revision: number;
  payload: FreightDraft;
  created_at: string;
};
export type ConversionResult = { trip_id: string; created: boolean; source_revision: number };
export function tripPlanningIssues(d: FreightDraft) {
  const issues: string[] = [];
  if (!d.origin.trim() || !d.destination.trim() || !d.driver.trim())
    issues.push("Preencha origem, destino e motorista.");
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(d.plate)) issues.push("Confira a placa do veículo.");
  if (
    !/^[0-9]{1,9}([.][0-9]{1,2})?$/.test(d.freight) ||
    Number(d.freight) <= 0 ||
    Number(d.freight) > 100000000
  )
    issues.push("Informe um frete positivo, com até duas casas decimais.");
  return issues;
}
export function tripPlanError(error: { message: string; code?: string }) {
  return ["PGRST205", "42P01", "PGRST202", "42883"].includes(error.code ?? "")
    ? "Aplique a migração 202610210005_trip_planning.sql no Supabase para habilitar o planejamento de viagens."
    : error.message;
}
