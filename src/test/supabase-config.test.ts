import { afterEach, describe, expect, it, vi } from "vitest";
const { createClient } = vi.hoisted(() => ({ createClient: vi.fn(() => ({ connected: true })) }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  createClient.mockClear();
});
describe("Lovable Supabase configuration", () => {
  it("uses the public project configuration when deployment variables are absent", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("VITE_DEMO_MODE", "");
    const { supabase } = await import("../supabase");
    expect(supabase).not.toBeNull();
    expect(createClient).toHaveBeenCalledWith(
      "https://nlteuqcyatsdjcuacguq.supabase.co",
      expect.stringMatching(/^sb_publishable_/),
    );
  });
  it("does not mix an overridden URL with another project key", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://other.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("VITE_DEMO_MODE", "");
    expect((await import("../supabase")).supabase).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });
  it("allows demonstration only when explicitly requested", async () => {
    vi.stubEnv("VITE_DEMO_MODE", "true");
    expect((await import("../supabase")).supabase).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });
});
