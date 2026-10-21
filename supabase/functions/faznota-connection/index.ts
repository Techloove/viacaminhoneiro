import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createHandler } from "./handler.ts";
// These are injected server-side by Supabase Edge Functions. Never put them in VITE_*.
const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) throw new Error("Configuração de servidor indisponível.");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const allowedOrigins = (
  Deno.env.get("FAZNOTA_ALLOWED_ORIGINS") ?? "https://viacaminhoneiro.lovable.app"
)
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
Deno.serve(
  createHandler({
    allowedOrigins,
    authenticate: async (token) => {
      const { data, error } = await admin.auth.getUser(token);
      return error ? null : (data.user?.id ?? null);
    },
    rpc: async (name, args) => {
      const { data, error } = await admin.rpc(name, args);
      return { data, error };
    },
    providerFetch: (url, init) => fetch(url, init),
  }),
);
