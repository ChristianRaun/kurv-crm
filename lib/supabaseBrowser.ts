// lib/supabaseBrowser.ts
import { createClient } from "@supabase/supabase-js";

/**
 * Browser-safe Supabase client (uses public anon key).
 * OK to use in client components and server components.
 */
export const supabaseBrowser = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
