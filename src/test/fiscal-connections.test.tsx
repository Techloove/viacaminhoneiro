import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  metadata: null as unknown,
  error: null as unknown,
  invoke: vi.fn(),
  session: { access_token: "test-user-jwt" } as { access_token: string } | null,
}));
vi.mock("../supabase", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        const q = {
          eq: () => q,
          maybeSingle: async () => ({ data: db.metadata, error: db.error }),
          order: () => q,
          limit: async () => ({ data: [], error: null }),
        };
        return q;
      },
    }),
    auth: { getSession: async () => ({ data: { session: db.session } }) },
    functions: { invoke: db.invoke },
  },
}));
import FiscalConnections from "../components/fiscal-connections";
afterEach(() => {
  cleanup();
  db.metadata = null;
  db.error = null;
  db.invoke.mockReset();
  db.session = { access_token: "test-user-jwt" };
});
describe("Fiscal credentials configuration", () => {
  it("does not expose management inputs to an operator", async () => {
    render(<FiscalConnections organizationId="org-a" role="operator" />);
    expect(await screen.findByText(/Somente o proprietário ou gestor/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Token de integração do FazNota")).not.toBeInTheDocument();
    expect(db.invoke).not.toHaveBeenCalled();
  });
  it("guides the user when the migration is missing", async () => {
    db.error = { code: "PGRST205", message: "missing table" };
    render(<FiscalConnections organizationId="org-a" role="owner" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "202610210006_faznota_connections.sql",
    );
    expect(screen.getByLabelText("Token de integração do FazNota")).toBeDisabled();
  });
  it("sends the token only to the protected function and clears the form after confirmation", async () => {
    db.invoke.mockResolvedValue({
      data: { ok: true, message: "Credencial armazenada no Vault." },
      error: null,
    });
    render(<FiscalConnections organizationId="org-a" role="owner" />);
    await waitFor(() =>
      expect(screen.getByLabelText("Token de integração do FazNota")).not.toBeDisabled(),
    );
    fireEvent.change(screen.getByLabelText("Token de integração do FazNota"), {
      target: { value: "fake-provider-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Armazenar credencial com segurança" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Credencial armazenada no Vault.");
    expect(db.invoke).toHaveBeenCalledWith("faznota-connection", {
      body: {
        action: "save",
        organization_id: "org-a",
        token: "fake-provider-token",
        environment: "unconfirmed",
      },
      headers: { Authorization: "Bearer test-user-jwt" },
    });
    expect(screen.getByLabelText("Token de integração do FazNota")).toHaveValue("");
    expect(document.body.textContent).not.toContain("fake-provider-token");
  });
  it("does not show success or keep a typed token when backend deployment is missing", async () => {
    db.invoke.mockResolvedValue({
      data: null,
      error: { context: new Response(null, { status: 404 }) },
    });
    render(<FiscalConnections organizationId="org-a" role="owner" />);
    await waitFor(() =>
      expect(screen.getByLabelText("Token de integração do FazNota")).not.toBeDisabled(),
    );
    fireEvent.change(screen.getByLabelText("Token de integração do FazNota"), {
      target: { value: "fake-provider-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Armazenar credencial com segurança" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "função faznota-connection foi publicada",
    );
    expect(screen.getByLabelText("Token de integração do FazNota")).toHaveValue("");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("shows a failed authentication test as a warning, without claiming a connection", async () => {
    db.metadata = {
      credential_configured: true,
      declared_environment: "unconfirmed",
      authentication_state: "unchecked",
      last_checked_at: null,
      api_version: null,
    };
    db.invoke.mockResolvedValue({
      data: { ok: true, authenticated: false, message: "Autenticação não confirmada." },
      error: null,
    });
    render(<FiscalConnections organizationId="org-a" role="manager" />);
    const button = await screen.findByRole("button", { name: "Testar autenticação sem emitir" });
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("Autenticação não confirmada.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
