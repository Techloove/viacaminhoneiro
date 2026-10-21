import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppNavigation from "../components/app-navigation";
afterEach(cleanup);
function setup(isAdmin = false, onNavigate = vi.fn(() => true)) {
  render(
    <AppNavigation
      page="Visão geral"
      company="Transportadora Exemplo"
      isAdmin={isAdmin}
      collapsed={false}
      onToggle={vi.fn()}
      onNavigate={onNavigate}
    />,
  );
  return onNavigate;
}
describe("Navegação do espaço de trabalho", () => {
  it("keeps platform administration restricted and searchable without hiding tenant navigation", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Administração SaaS" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar no menu" }), {
      target: { value: "clientes" },
    });
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(within(nav).getByRole("button", { name: "Clientes" })).toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "Viagens" })).not.toBeInTheDocument();
  });
  it("places the admin entry first when authorized", () => {
    setup(true);
    expect(within(screen.getByRole("navigation")).getAllByRole("button")[0]).toHaveTextContent(
      "Administração SaaS",
    );
  });
  it("preserves an open mobile menu when navigation is rejected for unsaved changes", () => {
    const navigate = setup(
      false,
      vi.fn(() => false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Viagens" }));
    expect(navigate).toHaveBeenCalledWith("Viagens");
    expect(screen.getByRole("button", { name: "Fechar menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    navigate.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Clientes" }));
    expect(screen.getByRole("button", { name: "Abrir menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
