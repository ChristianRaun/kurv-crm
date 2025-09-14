// app/api/ingest/whatsapp/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export function GET() {
  // helps verify the route exists in browser
  return NextResponse.json({ ok: true, route: "/api/ingest/whatsapp" });
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData(); // Twilio sends x-www-form-urlencoded
    const sid = String(form.get("MessageSid") ?? form.get("SmsMessageSid") ?? "");
    const from = String(form.get("From") ?? "").replace("whatsapp:", "");
    const body = String(form.get("Body") ?? "");

    if (!sid || !from) {
      return NextResponse.json({ ok: false, error: "Missing sid/from" }, { status: 400 });
    }

    // Optional shared secret (enforced only if set)
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
    const seen = await supa.from("source_events").select("id").eq("id", sid).maybeSingle();
    if (seen.data) return NextResponse.json({ ok: true, dedup: true });

    // Upsert contact by phone → always end up with a non-null contactId
    const got = await supa.from("contacts").select("id").contains("phones", [from]).maybeSingle();

    let contactId: string | null = got.data?.id ?? null;
    if (!contactId) {
      const ins = await supa
        .from("contacts")
        .insert({ phones: [from] })
        .select("id")
        .single();
      if (ins.error || !ins.data) {
        throw new Error(ins.error?.message ?? "Failed to create contact");
      }
      contactId = ins.data.id;
    }

    // Find latest WA conversation for this contact or create one
    const latest = await supa
      .from("conversations")
      .select("id")
      .eq("contact_id", contactId)
      .eq("channel", "whatsapp")
      .order("last_msg_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let convId: string;
    if (latest.data?.id) {
      convId = latest.data.id;
    } else {
      const created = await supa
        .from("conversations")
        .insert({ contact_id: contactId, channel: "whatsapp", status: "open" })
        .select("id")
        .single();
      if (created.error || !created.data) {
        throw new Error(created.error?.message ?? "Failed to create conversation");
      }
      convId = created.data.id;
    }

    // Store message
    const msg = await supa.from("messages").insert({
      conversation_id: convId,
      direction: "in",
      source: "import",
      body,
      channel_meta: { sid, from },
    });
    if (msg.error) throw new Error(msg.error.message);

    await supa
      .from("conversations")
      .update({ last_msg_at: new Date().toISOString(), status: "open" })
      .eq("id", convId);

    const se = await supa.from("source_events").insert({ id: sid, source: "twilio" });
    if (se.error) throw new Error(se.error.message);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("WA ingest error:", err);
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}
