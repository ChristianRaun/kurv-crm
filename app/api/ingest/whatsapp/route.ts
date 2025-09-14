// app/api/ingest/whatsapp/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData(); // Twilio sends x-www-form-urlencoded
    const sid = String(form.get("MessageSid") ?? form.get("SmsMessageSid") ?? "");
    const from = String(form.get("From") ?? "").replace("whatsapp:", "");
    const body = String(form.get("Body") ?? "");

    if (!sid || !from) {
      return NextResponse.json({ ok: false, error: "Missing sid/from" }, { status: 400 });
    }

    // If you set INGEST_SHARED_SECRET in Vercel, Twilio Sandbox can't send it.
    // Leave this block as-is (it only enforces if the env is set).
    if (process.env.INGEST_SHARED_SECRET) {
      const secret = req.headers.get("x-ingest-secret");
      if (secret !== process.env.INGEST_SHARED_SECRET) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    const supa = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!,
      { auth: { persistSession: false } }
    );

    // Idempotency
    const seen = await supa.from("source_events").select("id").eq("id", sid).maybeSingle();
    if (seen.data) return NextResponse.json({ ok: true, dedup: true });

    // Upsert contact
    const got = await supa.from("contacts").select("id").contains("phones", [from]).maybeSingle();
    const contact = got.data ??
      (await supa.from("contacts").insert({ phones: [from] }).select("id").single()).data;

    // Find latest WA conversation or create one
    let conv = (
      await supa.from("conversations")
        .select("id")
        .eq("contact_id", contact.id)
        .eq("channel", "whatsapp")
        .order("last_msg_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data;
    if (!conv) {
      conv = (
        await supa.from("conversations")
          .insert({ contact_id: contact.id, channel: "whatsapp", status: "open" })
          .select("id")
          .single()
      ).data;
    }

    // Store message
    await supa.from("messages").insert({
      conversation_id: conv!.id,
      direction: "in",
      source: "import",
      body,
      channel_meta: { sid, from },
    });
    await supa
      .from("conversations")
      .update({ last_msg_at: new Date().toISOString(), status: "open" })
      .eq("id", conv!.id);

    await supa.from("source_events").insert({ id: sid, source: "twilio" });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("WA ingest error:", err);
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}

// Optional: respond to GET with 405 so the sandbox URL shows "not allowed" (not 404)
export function GET() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
