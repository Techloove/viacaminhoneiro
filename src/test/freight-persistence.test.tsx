import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyFreightDraft, type DraftRow } from "../lib/freight-draft";
const db = vi.hoisted(() => ({
  rows: [] as unknown[],
  rpc: vi.fn(),
  listError: null as null | { code: string; message: string },
}));
vi.mock("../supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: async () => ({ data: db.rows, error: db.listError }) }),
        }),
      }),
    }),
    rpc: db.rpc,
  },
}));
import FreightAssistant from "../components/freight-assistant";
afterEach(() => {
  cleanup();
  db.rows = [];
  db.rpc.mockReset();
  db.listError = null;
});
describe("Draft persistence feedback", () => {
  it("reloads the saved organization draft after remount and keeps its saved step", async () => {
    db.rpc.mockImplementation(
      async (
        _name: string,
        args: {
          p_id: string;
          p_organization_id: string;
          p_payload: unknown;
          p_current_step: number;
        },
      ) => {
        const row = {
          id: args.p_id,
          organization_id: args.p_organization_id,
          payload: args.p_payload,
          current_step: args.p_current_step,
          revision: 1,
          updated_at: new Date().toISOString(),
        };
        db.rows = [row];
        return { data: row, error: null };
      },
    );
    const props = { organizationId: "org-a", notes: [], profile: null, onImport: vi.fn() };
    const view = render(<FreightAssistant {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Nova operação" }));
    fireEvent.change(screen.getByLabelText("Referência da operação"), {
      target: { value: "PERSISTENTE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Próxima etapa" }));
    fireEvent.change(screen.getByLabelText("Tomador do frete"), {
      target: { value: "Cliente persistente" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    expect(await screen.findByText(/Rascunho salvo na transportadora/)).toBeInTheDocument();
    expect(db.rpc).toHaveBeenCalledWith(
      "save_freight_draft",
      expect.objectContaining({
        p_organization_id: "org-a",
        p_expected_revision: 0,
        p_current_step: 1,
      }),
    );
    view.unmount();
    render(<FreightAssistant {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "Continuar operação" }));
    expect(screen.getByLabelText("Tomador do frete")).toHaveValue("Cliente persistente");
  });
  it("preserves local edits and reports a revision conflict instead of claiming saved", async () => {
    const row: DraftRow = {
      id: "draft-a",
      organization_id: "org-a",
      payload: { ...emptyFreightDraft(), reference: "Antes" },
      revision: 2,
      current_step: 0,
      updated_at: new Date().toISOString(),
    };
    db.rows = [row];
    db.rpc.mockResolvedValue({
      data: null,
      error: { code: "40001", message: "Rascunho alterado em outra sessão." },
    });
    render(
      <FreightAssistant organizationId="org-a" notes={[]} profile={null} onImport={vi.fn()} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Continuar operação" }));
    fireEvent.change(screen.getByLabelText("Referência da operação"), {
      target: { value: "Minha edição" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Rascunho alterado em outra sessão."),
    );
    expect(screen.getByLabelText("Referência da operação")).toHaveValue("Minha edição");
    expect(screen.getByText(/Alterações não salvas/)).toBeInTheDocument();
    expect(screen.queryByText(/Rascunho salvo na transportadora/)).not.toBeInTheDocument();
  });
  it("identifies a missing migration without claiming persistence", async () => {
    db.listError = { code: "PGRST205", message: "table missing" };
    render(
      <FreightAssistant organizationId="org-a" notes={[]} profile={null} onImport={vi.fn()} />,
    );
    expect(await screen.findByRole("status")).toHaveTextContent("202610210003_freight_drafts.sql");
  });
});
