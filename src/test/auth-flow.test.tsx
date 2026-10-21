import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  listener: null as null | ((_event: string, session: { user: { id: string } }) => void),
}));
vi.mock("../supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: (cb: typeof mocks.listener) => {
        mocks.listener = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      signInWithPassword: mocks.signIn,
    },
    from: () => ({
      select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }),
    }),
  },
}));
import App from "../components/via-app";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.listener = null;
});
describe("Authentication notices", () => {
  it("removes failed-login feedback once a later attempt authenticates", async () => {
    mocks.signIn
      .mockResolvedValueOnce({ error: new Error("Credenciais de login inválidas") })
      .mockImplementationOnce(async () => {
        mocks.listener?.("SIGNED_IN", { user: { id: "user-test" } });
        return { error: null };
      });
    render(<App />);
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "teste@example.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "senha-teste" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Credenciais de login inválidas");
    await waitFor(() => expect(screen.getByRole("button", { name: "Entrar" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("button", { name: "Criar minha operação" })).toBeInTheDocument();
    expect(screen.queryByText("Credenciais de login inválidas")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Entrar" })).not.toBeInTheDocument();
  });
});
