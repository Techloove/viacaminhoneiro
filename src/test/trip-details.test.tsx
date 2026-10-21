import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyFreightDraft } from "../lib/freight-draft";
import { tripPlanningIssues } from "../lib/trip-planning";
const db = vi.hoisted(() => ({ data: null as unknown, error: null as unknown, filters: vi.fn() }));
vi.mock("../supabase", () => ({
  supabase: {
    from: () => ({
      select: () => {
        const q = {
          eq: (k: string, v: unknown) => {
            db.filters(k, v);
            return q;
          },
          maybeSingle: async () => ({ data: db.data, error: db.error }),
        };
        return q;
      },
    }),
  },
}));
import TripDetails from "../components/trip-details";
afterEach(() => {
  cleanup();
  db.data = null;
  db.error = null;
  db.filters.mockClear();
});
const trip = {
  id: "trip-a",
  organization_id: "org-a",
  origin: "Curitiba / PR",
  destination: "Santos / SP",
  driver: "Motorista teste",
  plate: "ABC1D23",
  freight_cents: 123456,
  status: "draft",
};
describe("Trip planning details", () => {
  it("loads the organization snapshot and shows pending fiscal documents", async () => {
    db.data = {
      trip_id: trip.id,
      organization_id: "org-a",
      draft_id: "draft-a",
      source_revision: 3,
      payload: {
        ...emptyFreightDraft(),
        reference: "FRETE CONVERTIDO",
        cargo: "Carga preservada",
        invoiceKey: "1".repeat(44),
      },
      created_at: new Date().toISOString(),
    };
    render(<TripDetails trip={trip} organizationId="org-a" onClose={vi.fn()} />);
    expect(await screen.findByText("FRETE CONVERTIDO")).toBeInTheDocument();
    expect(screen.getByText("Carga preservada")).toBeInTheDocument();
    expect(screen.getAllByText(/Integração pendente · nenhuma emissão/)).toHaveLength(3);
    expect(screen.getByText(/Cópia da revisão 3/)).toBeInTheDocument();
    expect(db.filters).toHaveBeenCalledWith("organization_id", "org-a");
    expect(db.filters).toHaveBeenCalledWith("trip_id", trip.id);
  });
  it("distinguishes direct trip registration from an operation snapshot", async () => {
    render(<TripDetails trip={trip} organizationId="org-a" onClose={vi.fn()} />);
    expect(await screen.findByText(/Viagem cadastrada diretamente/)).toBeInTheDocument();
  });
  it("does not round or accept invalid money during planning validation", () => {
    const draft = {
      ...emptyFreightDraft(),
      origin: "A",
      destination: "B",
      driver: "C",
      plate: "ABC1D23",
      freight: "1.23",
    };
    expect(tripPlanningIssues(draft)).toEqual([]);
    expect(tripPlanningIssues({ ...draft, freight: "0.005" })).toContain(
      "Informe um frete positivo, com até duas casas decimais.",
    );
    expect(tripPlanningIssues({ ...draft, freight: "1e3" })).not.toEqual([]);
  });
});
