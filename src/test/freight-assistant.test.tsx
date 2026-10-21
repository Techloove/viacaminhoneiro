import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../supabase", () => ({ supabase: null }));
import FreightAssistant from "../components/freight-assistant";
import { parseInvoiceXml } from "../lib/nfe-import";
import { emptyFreightDraft, preparationIssues } from "../lib/freight-draft";
afterEach(cleanup);
describe("Freight preparation assistant", () => {
  it("reuses invoice data, preserves edits across steps and resumes a saved draft", async () => {
    render(
      <FreightAssistant
        organizationId={null}
        profile={null}
        onImport={vi.fn()}
        notes={[
          {
            key: "1".repeat(44),
            number: "77",
            issuer: "Remetente teste",
            recipient: "Destinatário teste",
            origin: "Curitiba / PR",
            destination: "Santos / SP",
            cargo: "Caixas de alimentos",
            weightKg: "1200",
            cargoValue: "30000",
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /NF-e 77/ }));
    fireEvent.click(screen.getByRole("button", { name: "Preparar frete com esta NF-e" }));
    expect(screen.getByLabelText("Carga predominante")).toHaveValue("Caixas de alimentos");
    expect(screen.getByLabelText("Chave da NF-e")).toHaveValue("1".repeat(44));
    fireEvent.change(screen.getByLabelText("Referência da operação"), {
      target: { value: "FRETE-TESTE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Próxima etapa" }));
    expect(screen.getByLabelText("Remetente")).toHaveValue("Remetente teste");
    fireEvent.change(screen.getByLabelText("Tomador do frete"), {
      target: { value: "Tomador definido" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByLabelText("Referência da operação")).toHaveValue("FRETE-TESTE");
    fireEvent.click(screen.getByRole("button", { name: "Próxima etapa" }));
    expect(screen.getByLabelText("Tomador do frete")).toHaveValue("Tomador definido");
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    expect(await screen.findByText(/Rascunho temporário: será perdido/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar assistente" }));
    fireEvent.change(screen.getByLabelText("Buscar operação"), {
      target: { value: "FRETE-TESTE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar operação" }));
    expect(screen.getByLabelText("Tomador do frete")).toHaveValue("Tomador definido");
    fireEvent.click(screen.getByRole("button", { name: /5 Revisão/ }));
    expect(screen.getByRole("button", { name: /Emitir CT-e/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Registrar CIOT/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Emitir MDF-e/ })).toBeDisabled();
  });
  it("does not discard unsaved changes when the user cancels closing", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<FreightAssistant organizationId={null} notes={[]} profile={null} onImport={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Nova operação" }));
    fireEvent.change(screen.getByLabelText("Referência da operação"), {
      target: { value: "Não perder" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Fechar assistente" }));
    expect(screen.getByLabelText("Referência da operação")).toHaveValue("Não perder");
    expect(confirm).toHaveBeenCalled();
    confirm.mockRestore();
  });
  it("identifies missing basic preparation without declaring fiscal approval", () => {
    const d = emptyFreightDraft();
    d.routeStates = "RS, XX";
    d.freight = "-1";
    expect(preparationIssues(d)).toContain("Confira as UFs do percurso, em ordem de passagem.");
    expect(preparationIssues(d)).toContain("Informe um frete bruto maior que zero.");
  });
});
describe("NF-e import", () => {
  const xml = `<nfeProc><NFe><infNFe Id="NFe${"1".repeat(44)}"><ide><nNF>0077</nNF></ide><emit><xNome>Remetente teste</xNome><enderEmit><xMun>Curitiba</xMun><UF>PR</UF></enderEmit></emit><dest><xNome>Cliente teste</xNome><enderDest><xMun>Santos</xMun><UF>SP</UF></enderDest></dest><det><prod><xProd>Caixas</xProd></prod></det><transp><transporta><CNPJ>11222333000181</CNPJ></transporta><vol><pesoB>100.50</pesoB></vol><vol><pesoB>20</pesoB></vol></transp><total><ICMSTot><vNF>30000.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`;
  it("extracts editable invoice suggestions while preserving identifiers as strings", () => {
    expect(parseInvoiceXml(xml)).toMatchObject({
      number: "0077",
      origin: "Curitiba / PR",
      destination: "Santos / SP",
      cargo: "Caixas",
      weightKg: "120.5",
      cargoValue: "30000.00",
      carrierCnpj: "11222333000181",
    });
  });
  it("rejects entity declarations and malformed XML", () => {
    expect(() =>
      parseInvoiceXml('<!DOCTYPE x [<!ENTITY file SYSTEM "file:///etc/passwd">]><x/>'),
    ).toThrow(/entidades/);
    expect(() => parseInvoiceXml("<NFe>")).toThrow(/inválido/);
  });
});
