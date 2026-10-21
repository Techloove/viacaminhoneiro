import { createClient } from "@supabase/supabase-js";
import { publicSupabaseConfig } from "./lib/public-supabase-config";

// Explicit environment configuration takes precedence as a pair to avoid mixing projects.
const envUrl = import.meta.env["VITE_SUPABASE_URL"];
const envKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
const hasOverride = Boolean(envUrl || envKey);
const url = hasOverride ? envUrl : publicSupabaseConfig.url;
const key = hasOverride ? envKey : publicSupabaseConfig.publishableKey;
const demo = import.meta.env["VITE_DEMO_MODE"] === "true";
export const supabase = !demo && url && key ? createClient(url, key) : null;
