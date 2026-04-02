import { createClient } from "@supabase/supabase-js";

/** Trim, strip accidental quotes, normalize URL (Vite reads .env at dev start / build time only). */
function cleanEnv(value) {
  if (value == null || typeof value !== "string") {
    return "";
  }
  let v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

const supabaseUrlRaw = cleanEnv(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKeyRaw = cleanEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);

const supabaseUrl = supabaseUrlRaw.replace(/\/+$/, "");
const supabaseAnonKey = supabaseAnonKeyRaw;

export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

/** Which vars are empty at build/dev time (for UI hints only — no secrets). */
export const missingSupabaseEnvVars = [
  !supabaseUrlRaw && "VITE_SUPABASE_URL",
  !supabaseAnonKeyRaw && "VITE_SUPABASE_ANON_KEY",
].filter(Boolean);
