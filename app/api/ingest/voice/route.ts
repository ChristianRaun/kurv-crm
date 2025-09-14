// app/api/ingest/voice/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const p = await req.json();
    const callSid: string = p?.callSid ?? "";
    const from: string = p?.from ?? "";
    const summary: string | null = p?.summary ?? null;
    const recordingUrl: string | null = p?.recordingUrl ?? null;

    if (!callSid || !from) {
      return NextResponse.json({ ok: false, error: "Missing callSid/from" }, { status: 400 });
    }

    // Optional shared secret
    if (process.env.INGEST_SHARED_SECRET) {
      const secret = req.headers.get("x-ingest-secret");
      if (secret !== process.env.INGEST_SHARED_SECRET) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE!, {
      auth: { persistSession: false },
    });

    // Idempotency
    const seen = await supa.from("source_events").select("id").eq("id", callSid).maybeSingle();
    if (seen.data) return NextResponse.json({ ok: true, dedup: true });

    // Upsert contact (by phone)
    const got = await supa.from("contacts").select("id").contains("phones", [from]).maybeSingle();

    let contactId: string | null = got.data?.id ?? null;
    if (!contactId) {
      const ins = await supa.from("contacts").insert({ phones: [from] }).select("id").single();
      if (ins.error || !ins.data) throw new Error(ins.error?.message ?? "Failed to create contact");
      contactId = ins.data.id;
    }

    // Find latest phone conversation or create one
    const latest = await supa
      .from("conversations")
      .select("id")
      .eq("contact_id", contactId)
      .eq("channel", "phone")
      .order("last_msg_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let convId: string;
    if (latest.data?.id) {
      convId = latest.data.id;
    } else {
      const created = await supa
        .from("conversations")
        .insert({ contact_id: contactId, channel: "phone", status: "open" })
        .select("id")
        .single();
      if (created.error || !created.data) throw new Error(created.error?.message ?? "Failed to create conversation");
      convId = created.data.id;
    }

    // Store message
    const msg = await supa.from("messages").insert({
      conversation_id: convId,
      direction: "in",
      source: "import",
      body: summary ?? "Incoming call",
      channel_meta: { callSid, from, recordingUrl },
    });
    if (msg.error) throw new Error(msg.error.message);

    await supa
      .from("conversations")
      .update({ last_msg_at: new Date().toISOString(), status: "open" })
      .eq("id", convId);

    const se = await supa.from("source_events").insert({ id: callSid, source: "twilio" });
    if (se.error) throw new Error(se.error.message);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Voice ingest error:", err);
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}

// Optional GET to verify the route exists
export function GET() {
  return NextResponse.json({ ok: true, route: "/api/ingest/voice" });
}
