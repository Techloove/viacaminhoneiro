import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyFreightDraft, type DraftRow } from "../lib/freight-draft";
const db = vi.hoisted(() => ({
  rows: [] as unknown[],
  rpc: vi.fn(),
  listError: null as null | { code: string; message: string },
}));
vi.mock("../supabase", () => ({
  supabase: {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: async () => ({
          data: table === "freight_drafts" ? db.rows : [],
          error: table === "freight_drafts" ? db.listError : null,
        }),
      };
      return query;
    },
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
describe("Trip creation from saved drafts", () => {
  const ready = () => ({
    id: "draft-ready",
    organization_id: "org-a",
    payload: {
      ...emptyFreightDraft(),
      reference: "FRETE-PRONTO",
      origin: "Curitiba / PR",
      destination: "Santos / SP",
      driver: "Motorista teste",
      plate: "ABC1D23",
      freight: "1234.56",
    },
    revision: 2,
    current_step: 4,
    updated_at: new Date().toISOString(),
  });
  it("creates planning from the saved revision and keeps fiscal transmission disabled", async () => {
    db.rows = [ready()];
    db.rpc.mockResolvedValue({
      data: { trip_id: "trip-created", created: true, source_revision: 2 },
      error: null,
    });
    const onTripCreated = vi.fn();
    render(
      <FreightAssistant
        organizationId="org-a"
        notes={[]}
        profile={null}
        onImport={vi.fn()}
        onTripCreated={onTripCreated}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Continuar operação" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar ou abrir viagem de planejamento" }));
    await waitFor(() => expect(onTripCreated).toHaveBeenCalledWith("trip-created"));
    expect(db.rpc).toHaveBeenCalledWith("create_trip_from_draft", {
      p_draft_id: "draft-ready",
      p_organization_id: "org-a",
      p_expected_revision: 2,
    });
    expect(screen.getByRole("button", { name: /Emitir CT-e/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Registrar CIOT/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Emitir MDF-e/ })).toBeDisabled();
  });
  it("keeps incomplete drafts savable but prevents trip conversion", async () => {
    db.rows = [{ ...ready(), payload: emptyFreightDraft() }];
    render(
      <FreightAssistant organizationId="org-a" notes={[]} profile={null} onImport={vi.fn()} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Continuar operação" }));
    expect(
      screen.getByRole("button", { name: "Criar ou abrir viagem de planejamento" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Observações"), {
      target: { value: "Continuar depois" },
    });
    expect(screen.getByRole("button", { name: "Salvar progresso" })).not.toBeDisabled();
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("keeps the draft when the server rejects a stale conversion", async () => {
    db.rows = [ready()];
    db.rpc.mockResolvedValue({
      data: null,
      error: { code: "40001", message: "Rascunho alterado em outra sessão." },
    });
    const onTripCreated = vi.fn();
    render(
      <FreightAssistant
        organizationId="org-a"
        notes={[]}
        profile={null}
        onImport={vi.fn()}
        onTripCreated={onTripCreated}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Continuar operação" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar ou abrir viagem de planejamento" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Rascunho alterado em outra sessão.",
    );
    expect(onTripCreated).not.toHaveBeenCalled();
    expect(screen.getByText("FRETE-PRONTO")).toBeInTheDocument();
  });
});
describe("Draft persistence feedback", () => {
  it("shows saving beside the button and only confirms success after the server returns", async () => {
    let finish: (() => void) | undefined;
    db.rpc.mockImplementation(
      (
        _name: string,
        args: {
          p_id: string;
          p_organization_id: string;
          p_payload: unknown;
          p_current_step: number;
        },
      ) =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              data: {
                id: args.p_id,
                organization_id: args.p_organization_id,
                payload: args.p_payload,
                current_step: args.p_current_step,
                revision: 1,
                updated_at: new Date().toISOString(),
              },
              error: null,
            });
        }),
    );
    render(
      <FreightAssistant organizationId="org-a" notes={[]} profile={null} onImport={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Nova operação" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    expect(screen.getByLabelText("Resultado do salvamento")).toHaveTextContent(
      "Salvando seu progresso",
    );
    expect(screen.getByRole("button", { name: "Salvando…" })).toBeDisabled();
    expect(screen.queryByText(/Salvo na transportadora às/)).not.toBeInTheDocument();
    await act(async () => {
      finish?.();
    });
    expect(screen.getByLabelText("Resultado do salvamento")).toHaveTextContent(
      /Salvo na transportadora às \d{2}:\d{2}:\d{2} · versão 1/,
    );
    expect(screen.getByRole("button", { name: "Rascunho salvo" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Referência da operação"), {
      target: { value: "Nova edição" },
    });
    expect(screen.getByLabelText("Resultado do salvamento")).toHaveTextContent(
      "Há alterações pendentes",
    );
    expect(screen.getByRole("button", { name: "Salvar rascunho" })).not.toBeDisabled();
  });
  it("shows a failed save beside the button and preserves the entered fields", async () => {
    db.rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Sem permissão para salvar." },
    });
    render(
      <FreightAssistant organizationId="org-a" notes={[]} profile={null} onImport={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Nova operação" }));
    fireEvent.change(screen.getByLabelText("Referência da operação"), {
      target: { value: "Não perder" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Salvamento não confirmado");
    expect(screen.getByLabelText("Resultado do salvamento")).toHaveTextContent(
      "Sem permissão para salvar.",
    );
    expect(screen.getByLabelText("Referência da operação")).toHaveValue("Não perder");
    expect(screen.queryByRole("button", { name: "Rascunho salvo" })).not.toBeInTheDocument();
  });

  it("saves a completely blank draft without requiring fiscal or travel data", async () => {
    db.rpc.mockImplementation(
      async (
        _name: string,
        args: {
          p_id: string;
          p_organization_id: string;
          p_payload: unknown;
          p_current_step: number;
        },
      ) => ({
        data: {
          id: args.p_id,
          organization_id: args.p_organization_id,
          payload: args.p_payload,
          current_step: args.p_current_step,
          revision: 1,
          updated_at: new Date().toISOString(),
        },
        error: null,
      }),
    );
    render(
      <FreightAssistant organizationId="org-a" notes={[]} profile={null} onImport={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Nova operação" }));
    expect(screen.getByText(/Pode salvar agora, mesmo sem todos os dados/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar progresso" }));
    expect(await screen.findByText(/Rascunho salvo na transportadora/)).toBeInTheDocument();
    expect(db.rpc).toHaveBeenCalledWith(
      "save_freight_draft",
      expect.objectContaining({
        p_payload: expect.objectContaining({
          reference: "",
          invoiceKey: "",
          freight: "",
          plate: "",
        }),
        p_expected_revision: 0,
      }),
    );
  });

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
