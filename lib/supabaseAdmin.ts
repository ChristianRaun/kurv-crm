// lib/supabaseAdmin.ts
import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client (uses Service Role).
 * ⚠️ Never import this in client components.
 */
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,          // from .env.local (server-only)
  process.env.SUPABASE_SERVICE_ROLE!, // from .env.local (server-only)
  { auth: { persistSession: false } }
);
