import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const p = await req.json();
    const { messageId, fromEmail, subject, text } = p || {};
    if (!messageId || !fromEmail) {
      return NextResponse.json({ ok: false, error: "Missing messageId/fromEmail" }, { status: 400 });
    }

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
    const seen = await supa.from("source_events").select("id").eq("id", messageId).maybeSingle();
    if (seen.data) return NextResponse.json({ ok: true, dedup: true });

    // Contact by email (create if missing)
    const got = await supa.from("contacts").select("id").contains("emails", [fromEmail]).maybeSingle();

    let contactId: string | null = got.data?.id ?? null;
    if (!contactId) {
      const ins = await supa
        .from("contacts")
        .insert({ emails: [fromEmail] })
        .select("id")
        .single();
      if (ins.error || !ins.data) {
        throw new Error(ins.error?.message ?? "Failed to create contact");
      }
      contactId = ins.data.id;
    }

    // New conversation per email thread (simple model)
    const convRes = await supa
      .from("conversations")
      .insert({ contact_id: contactId, channel: "email", subject: subject ?? null, status: "open" })
      .select("id")
      .single();
    if (convRes.error || !convRes.data) {
      throw new Error(convRes.error?.message ?? "Failed to create conversation");
    }
    const convId = convRes.data.id;

    // Store message
    const msgRes = await supa.from("messages").insert({
      conversation_id: convId,
      direction: "in",
      source: "import",
      body: text ?? "",
      channel_meta: { messageId, fromEmail },
    }
