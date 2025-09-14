// app/api/health/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const supa = createClient(
    process.env.SUPABASE_URL!,           // server-only
    process.env.SUPABASE_SERVICE_ROLE!,  // server-only
    { auth: { persistSession: false } }
  );

  const { count, error } = await supa
    .from("conversations")
    .select("id", { count: "exact", head: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, conversations: count ?? 0 });
}
