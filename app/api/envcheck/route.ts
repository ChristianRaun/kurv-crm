// app/api/health/route.ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";

export async function GET() {
  const supa = createAdminClient();               // ← created at request time
  const { count, error } = await supa
    .from("conversations")
    .select("id", { count: "exact", head: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, conversations: count ?? 0 });
}
