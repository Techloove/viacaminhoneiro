import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Driver, Vehicle } from "../lib/fleet";
import { validCpf } from "../lib/fleet";
import { emptyFreightDraft } from "../lib/freight-draft";
const db = vi.hoisted(() => ({
  drivers: [] as unknown[],
  vehicles: [] as unknown[],
  write: vi.fn(),
  filters: [] as unknown[],
}));
vi.mock("../supabase", () => ({
  supabase: {
    from: (table: string) => {
      const read = {
        eq: (key: string, value: unknown) => {
          db.filters.push([table, key, value]);
          return read;
        },
        order: () => read,
        limit: async () => ({
          data: table === "carrier_drivers" ? db.drivers : db.vehicles,
          error: null,
        }),
      };
      const mutation = (payload: unknown, mode: string) => {
        const filters: unknown[] = [];
        const q = {
          eq: (key: string, value: unknown) => {
            filters.push([key, value]);
            return q;
          },
          select: () => q,
          single: () => db.write(table, payload, mode, filters),
        };
        return q;
      };
      return {
        select: () => read,
        insert: (p: unknown) => mutation(p, "insert"),
        update: (p: unknown) => mutation(p, "update"),
      };
    },
  },
}));
import FleetRegistry, { FleetEditor } from "../components/fleet-registry";
import FleetPicker from "../components/fleet-picker";
afterEach(() => {
  cleanup();
  db.drivers = [];
  db.vehicles = [];
  db.filters = [];
  db.write.mockReset();
});
const driver: Driver = {
  id: "driver-a",
  organization_id: "org-a",
  name: "Motorista teste",
  cpf: "52998224725",
  license_number: "",
  license_expiry: null,
  phone: "",
  active: true,
};
const power: Vehicle = {
  id: "power-a",
  organization_id: "org-a",
  plate: "ABC1D23",
  kind: "tractor",
  axles: 3,
  rntrc: "",
  owner_name: "",
  owner_document: "",
  description: "",
  active: true,
};
const trailer: Vehicle = { ...power, id: "trailer-a", plate: "DEF4G56", kind: "trailer", axles: 2 };
describe("Fleet registry", () => {
  it("validates CPF check digits", () => {
    expect(validCpf(driver.cpf)).toBe(true);
    expect(validCpf("52998224726")).toBe(false);
    expect(validCpf("11111111111")).toBe(false);
  });
  it("rejects invalid CPF without submitting a driver", () => {
    render(
      <FleetEditor kind="driver" organizationId="org-a" onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Nome do motorista"), {
      target: { value: "Motorista" },
    });
    fireEvent.change(screen.getByLabelText("CPF"), { target: { value: "52998224726" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
    expect(screen.getByRole("alert")).toHaveTextContent("dígitos verificadores");
    expect(db.write).not.toHaveBeenCalled();
  });
  it("saves drivers under the current organization and lists the result", async () => {
    db.write.mockResolvedValue({ data: driver, error: null });
    render(<FleetRegistry organizationId="org-a" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cadastrar motorista" })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar motorista" }));
    fireEvent.change(screen.getByLabelText("Nome do motorista"), {
      target: { value: driver.name },
    });
    fireEvent.change(screen.getByLabelText("CPF"), { target: { value: "529.982.247-25" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
    expect(await screen.findByText("Cadastro salvo na transportadora.")).toBeInTheDocument();
    expect(screen.getByText(driver.name)).toBeInTheDocument();
    expect(db.write).toHaveBeenCalledWith(
      "carrier_drivers",
      expect.objectContaining({ organization_id: "org-a", cpf: driver.cpf }),
      "insert",
      [],
    );
  });
  it("keeps inactive records hidden until requested and allows reactivation", async () => {
    db.drivers = [{ ...driver, active: false }];
    db.write.mockResolvedValue({ data: driver, error: null });
    render(<FleetRegistry organizationId="org-a" />);
    await waitFor(() => expect(db.filters.length).toBeGreaterThan(0));
    expect(screen.queryByText(driver.name)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Mostrar inativos"));
    fireEvent.click(await screen.findByRole("button", { name: "Editar cadastro" }));
    fireEvent.click(screen.getByLabelText("Cadastro ativo para novas operações"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
    expect(await screen.findByText("Cadastro salvo na transportadora.")).toBeInTheDocument();
    expect(db.write).toHaveBeenCalledWith(
      "carrier_drivers",
      expect.objectContaining({ active: true }),
      "update",
      [
        ["id", driver.id],
        ["organization_id", "org-a"],
      ],
    );
  });
  it("normalizes vehicle plates and keeps form values after a duplicate error", async () => {
    db.write.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate" } });
    render(
      <FleetEditor kind="vehicle" organizationId="org-a" onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Placa"), { target: { value: "abc-1d23" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Confira também os inativos");
    expect(screen.getByLabelText("Placa")).toHaveValue("abc-1d23");
    expect(db.write).toHaveBeenCalledWith(
      "carrier_vehicles",
      expect.objectContaining({ plate: "ABC1D23", organization_id: "org-a" }),
      "insert",
      [],
    );
  });
});
function PickerHarness() {
  const [draft, setDraft] = useState({ ...emptyFreightDraft(), reference: "FRETE PRESERVADO" });
  return (
    <>
      <FleetPicker
        organizationId="org-a"
        draft={draft}
        onApply={(data) => setDraft((d) => ({ ...d, ...data }))}
      />
      <output data-testid="snapshot">{JSON.stringify(draft)}</output>
    </>
  );
}
describe("Quick selection in freight preparation", () => {
  it("copies driver and composition data without overwriting the rest of the draft", async () => {
    db.drivers = [driver];
    db.vehicles = [power, trailer];
    render(<PickerHarness />);
    await screen.findByRole("option", { name: /Motorista teste/ });
    fireEvent.change(screen.getByLabelText("Selecionar motorista cadastrado"), {
      target: { value: driver.id },
    });
    fireEvent.change(screen.getByLabelText("Selecionar veículo de tração"), {
      target: { value: power.id },
    });
    fireEvent.change(screen.getByLabelText("Selecionar implemento cadastrado"), {
      target: { value: trailer.id },
    });
    const snapshot = JSON.parse(screen.getByTestId("snapshot").textContent!);
    expect(snapshot).toMatchObject({
      reference: "FRETE PRESERVADO",
      driver: driver.name,
      driverDocument: driver.cpf,
      plate: power.plate,
      trailer: trailer.plate,
      axles: "5",
    });
    expect(db.filters).toContainEqual(["carrier_drivers", "organization_id", "org-a"]);
    expect(db.filters).toContainEqual(["carrier_vehicles", "active", true]);
  });
  it("creates a driver inline and fills the draft after confirmation from the database", async () => {
    db.write.mockResolvedValue({ data: driver, error: null });
    render(<PickerHarness />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cadastrar motorista aqui" })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar motorista aqui" }));
    fireEvent.change(screen.getByLabelText("Nome do motorista"), {
      target: { value: driver.name },
    });
    fireEvent.change(screen.getByLabelText("CPF"), { target: { value: driver.cpf } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(JSON.parse(screen.getByTestId("snapshot").textContent!)).toMatchObject({
      reference: "FRETE PRESERVADO",
      driver: driver.name,
      driverDocument: driver.cpf,
    });
  });
});
