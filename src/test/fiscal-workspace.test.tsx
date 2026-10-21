import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import FiscalWorkspace from "../components/fiscal-workspace";
afterEach(cleanup);
describe("Fiscal preparation", () => {
  it("keeps drafts local and never shows them as transmitted", () => {
    render(<FiscalWorkspace trips={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Preparar CT-e" }));
    for (const [label, value] of [
      ["Referência interna", "TESTE-01"],
      ["Emitente", "Empresa de teste"],
      ["Tomador do serviço", "Contratante"],
      ["Origem", "Curitiba / PR"],
      ["Destino", "Santos / SP"],
      ["Placa do veículo", "ABC1D23"],
      ["Frete bruto (R$)", "1000"],
    ]) {
      fireEvent.change(screen.getByLabelText(label!), { target: { value } });
    }
    fireEvent.click(screen.getByRole("button", { name: "Guardar rascunho nesta sessão" }));
    expect(screen.getByText("TESTE-01")).toBeInTheDocument();
    expect(screen.getByText("Não enviado")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Acompanhamento" }));
    expect(screen.getByText("Nenhum documento transmitido")).toBeInTheDocument();
  });
  it("blocks transmission of events and describes CIOT as a separate dependency", () => {
    render(<FiscalWorkspace trips={[]} />);
    fireEvent.click(screen.getByRole("tab", { name: "Eventos" }));
    expect(
      screen.getByRole("button", { name: "Disponível após conectar a integração" }),
    ).toBeDisabled();
    expect(screen.getByText(/Encerrar MDF-e não encerra CIOT/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Integração" }));
    expect(
      screen.getByText("TAC e equiparado a TAC não são atendidos por esse caminho."),
    ).toBeInTheDocument();
  });
});
