import { fireEvent, render, screen, waitFor, cleanup, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../supabase", () => ({ supabase: null }));
import App from "../components/via-app";
afterEach(cleanup);
describe("Via Caminhoneiro demo", () => {
  it("creates a draft and shows gross freight without claiming fiscal authorization", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Nova viagem" }));
    fireEvent.change(screen.getByLabelText("Origem"), { target: { value: "Curitiba / PR" } });
    fireEvent.change(screen.getByLabelText("Destino"), { target: { value: "Santos / SP" } });
    fireEvent.change(screen.getByLabelText("Motorista"), {
      target: { value: "Motorista de teste" },
    });
    fireEvent.change(screen.getByLabelText("Placa"), { target: { value: "ABC1D23" } });
    fireEvent.change(screen.getByLabelText("Frete bruto (R$)"), { target: { value: "2500" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    await waitFor(() => expect(screen.getByText("Curitiba / PR")).toBeInTheDocument());
    expect(screen.getByText("Rascunho")).toBeInTheDocument();
    expect(screen.getByText(/Ele será perdido ao recarregar/)).toBeInTheDocument();
  });
  it("rejects malformed plates without creating a trip", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Nova viagem" }));
    fireEvent.change(screen.getByLabelText("Origem"), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText("Destino"), { target: { value: "B" } });
    fireEvent.change(screen.getByLabelText("Motorista"), { target: { value: "Teste" } });
    fireEvent.change(screen.getByLabelText("Placa"), { target: { value: "INVALID" } });
    fireEvent.change(screen.getByLabelText("Frete bruto (R$)"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent(
      /Confira a placa/,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
