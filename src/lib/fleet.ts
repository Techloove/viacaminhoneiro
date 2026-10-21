export type Driver = {
  id: string;
  organization_id: string;
  name: string;
  cpf: string;
  license_number: string;
  license_expiry: string | null;
  phone: string;
  active: boolean;
};
export type Vehicle = {
  id: string;
  organization_id: string;
  plate: string;
  kind: "truck" | "tractor" | "trailer";
  axles: number;
  rntrc: string;
  owner_name: string;
  owner_document: string;
  description: string;
  active: boolean;
};
export type FleetKind = "driver" | "vehicle";
export const vehicleKinds = {
  truck: "Caminhão",
  tractor: "Cavalo-trator",
  trailer: "Implemento / carreta",
} as const;
export function validCpf(value: string) {
  if (!/^\d{11}$/.test(value) || /^(\d)\1+$/.test(value)) return false;
  for (let check = 9; check <= 10; check++) {
    let sum = 0;
    for (let i = 0; i < check; i++) sum += Number(value[i]) * (check + 1 - i);
    const digit = (sum * 10) % 11;
    if ((digit === 10 ? 0 : digit) !== Number(value[check])) return false;
  }
  return true;
}
export function fleetError(error: { message: string; code?: string }) {
  if (["PGRST205", "42P01"].includes(error.code ?? ""))
    return "Aplique a migração 202610210004_fleet_registry.sql no Supabase para habilitar motoristas e veículos.";
  if (error.code === "23505")
    return "Já existe um cadastro com este CPF ou placa nesta transportadora. Confira também os inativos.";
  if (error.code === "42501") return "Seu usuário não tem permissão para alterar este cadastro.";
  return error.message;
}
