import { z } from "zod";
export const freightDraftSchema = z.object({
  reference: z.string().max(100).default(""),
  invoiceKey: z.string().max(44).default(""),
  invoiceNumber: z.string().max(20).default(""),
  carrierCnpj: z.string().max(14).default(""),
  cargo: z.string().max(300).default(""),
  weightKg: z.string().max(20).default(""),
  cargoValue: z.string().max(20).default(""),
  cargoType: z.string().max(80).default("Carga geral"),
  senderDocument: z.string().max(14).default(""),
  recipientDocument: z.string().max(14).default(""),
  payerDocument: z.string().max(14).default(""),
  sender: z.string().max(160).default(""),
  recipient: z.string().max(160).default(""),
  payer: z.string().max(160).default(""),
  cfop: z.string().max(4).default(""),
  freight: z.string().max(20).default(""),
  toll: z.string().max(20).default(""),
  origin: z.string().max(120).default(""),
  destination: z.string().max(120).default(""),
  routeStates: z.string().max(100).default(""),
  startDate: z.string().max(10).default(""),
  endDate: z.string().max(10).default(""),
  driver: z.string().max(120).default(""),
  driverDocument: z.string().max(11).default(""),
  plate: z.string().max(7).default(""),
  trailer: z.string().max(7).default(""),
  axles: z.string().max(2).default(""),
  operationType: z.enum(["lotacao", "fracionada", "agregado"]).default("lotacao"),
  emptyReturn: z.boolean().default(false),
  highPerformance: z.boolean().default(false),
  contractor: z.string().max(160).default(""),
  receiver: z.string().max(160).default(""),
  paymentMethod: z.enum(["pix", "bank", "other"]).default("pix"),
  paymentReference: z.string().max(100).default(""),
  notes: z.string().max(2000).default(""),
});
export type FreightDraft = z.infer<typeof freightDraftSchema>;
export const emptyFreightDraft = () => freightDraftSchema.parse({});
export type DraftRow = {
  id: string;
  organization_id: string;
  payload: FreightDraft;
  revision: number;
  current_step: number;
  updated_at: string;
};
export const wizardSteps = ["Carga", "Participantes", "Frete", "Viagem e CIOT", "Revisão"] as const;
export function preparationIssues(d: FreightDraft): string[] {
  const issues: string[] = [];
  if (!d.reference.trim()) issues.push("Informe uma referência para identificar a operação.");
  if (!/^\d{44}$/.test(d.invoiceKey)) issues.push("Informe uma chave de NF-e de 44 dígitos.");
  if (!d.cargo.trim()) issues.push("Descreva a carga predominante.");
  if (!d.sender.trim() || !d.recipient.trim() || !d.payer.trim())
    issues.push("Confira remetente, destinatário e tomador do frete.");
  if (!/^\d{4}$/.test(d.cfop)) issues.push("Informe o CFOP para revisão fiscal.");
  if (!Number.isFinite(Number(d.freight)) || Number(d.freight) <= 0)
    issues.push("Informe um frete bruto maior que zero.");
  if (!d.origin.trim() || !d.destination.trim()) issues.push("Preencha origem e destino.");
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(d.plate)) issues.push("Confira a placa do veículo.");
  if (!d.driver.trim()) issues.push("Informe o motorista.");
  if (!d.startDate || !d.endDate || d.endDate < d.startDate)
    issues.push("Confira as datas de início e fim da viagem.");
  if (!d.contractor.trim() || !d.receiver.trim())
    issues.push("Informe contratante e recebedor do frete.");
  if (!d.paymentReference.trim())
    issues.push("Informe a identificação do pagamento, sem senhas ou dados de cartão.");
  const ufs = d.routeStates.split(/[\s,;]+/).filter(Boolean);
  const valid = new Set(
    "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "),
  );
  if (ufs.length === 0 || ufs.some((uf) => !valid.has(uf)))
    issues.push("Confira as UFs do percurso, em ordem de passagem.");
  return issues;
}
