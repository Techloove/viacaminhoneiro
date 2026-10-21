import { XMLParser, XMLValidator } from "fast-xml-parser";
export type ImportedInvoice = {
  key: string;
  number: string;
  issuer: string;
  carrierCnpj: string;
  recipient: string;
  origin: string;
  destination: string;
  cargo: string;
  weightKg: string;
  cargoValue: string;
};
export function parseInvoiceXml(text: string): ImportedInvoice {
  if (text.length > 2_000_000) throw Error("O XML deve ter até 2 MB.");
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw Error("XML com entidades externas não é permitido.");
  if (XMLValidator.validate(text) !== true) throw Error("XML inválido.");
  const xml = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    removeNSPrefix: true,
  }).parse(text);
  const inf = (xml.nfeProc?.NFe ?? xml.NFe)?.infNFe;
  const key = String(inf?.["@_Id"] ?? "").replace(/^NFe/, "");
  if (!/^\d{44}$/.test(key)) throw Error("Não foi encontrada uma NF-e com chave válida.");
  const city = (a: Record<string, string> | undefined) =>
    a ? [a["xMun"], a["UF"]].filter(Boolean).join(" / ") : "";
  const items = Array.isArray(inf.det) ? inf.det : [inf.det].filter(Boolean);
  const volumes = Array.isArray(inf.transp?.vol)
    ? inf.transp.vol
    : [inf.transp?.vol].filter(Boolean);
  const weight = volumes.reduce(
    (total: number, v: { pesoB?: string }) => total + Number(v.pesoB ?? 0),
    0,
  );
  return {
    key,
    number: String(inf.ide?.nNF ?? ""),
    issuer: String(inf.emit?.xNome ?? ""),
    carrierCnpj: String(inf.transp?.transporta?.CNPJ ?? "").replace(/\D/g, ""),
    recipient: String(inf.dest?.xNome ?? ""),
    origin: city(inf.emit?.enderEmit),
    destination: city(inf.dest?.enderDest),
    cargo: items
      .slice(0, 3)
      .map((i: { prod?: { xProd?: string } }) => i.prod?.xProd ?? "")
      .filter(Boolean)
      .join("; ")
      .slice(0, 300),
    weightKg: Number.isFinite(weight) && weight > 0 ? String(weight) : "",
    cargoValue: String(inf.total?.ICMSTot?.vNF ?? ""),
  };
}
