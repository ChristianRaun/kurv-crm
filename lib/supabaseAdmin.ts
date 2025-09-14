// lib/supabaseAdmin.ts
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) {
    // Don't throw at import time — only when actually called.
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
