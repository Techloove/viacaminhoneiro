import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../supabase", () => ({ supabase: null }));
import { CarrierOperation } from "../components/carrier-operation";
import { validCnpj } from "../lib/cnpj";
afterEach(cleanup);
describe("Carrier freight workflow", () => {
  it("does not enable CIOT or MDF-e from a manually imported NF-e", () => {
    render(
      <CarrierOperation
        notes={[
          {
            key: "1".repeat(44),
            number: "123",
            issuer: "Emitente teste",
            carrierCnpj: "11222333000181",
          },
        ]}
        profile={{
          name: "Transportadora",
          cnpj: "11222333000181",
          rntrc: "",
          state_registration: "",
          email: "",
        }}
        onImport={vi.fn()}
        onFiscal={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /NF-e 123/ }));
    expect(screen.getByText("CNPJ compatível com o cadastro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Registrar CIOT/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Emitir MDF-e/ })).toBeDisabled();
    expect(screen.getByText(/Isso não comprova autenticidade/)).toBeInTheDocument();
  });
  it("requires review when the XML carrier differs from the tenant registration", () => {
    render(
      <CarrierOperation
        notes={[
          {
            key: "2".repeat(44),
            number: "321",
            issuer: "Emitente teste",
            carrierCnpj: "11222333000181",
          },
        ]}
        profile={null}
        onImport={vi.fn()}
        onFiscal={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /NF-e 321/ }));
    expect(screen.getByText("Revisão de vínculo necessária")).toBeInTheDocument();
  });
  it("validates CNPJ check digits rather than only its length", () => {
    expect(validCnpj("11222333000181")).toBe(true);
    expect(validCnpj("11222333000182")).toBe(false);
    expect(validCnpj("11111111111111")).toBe(false);
  });
});
