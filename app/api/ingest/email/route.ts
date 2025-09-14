// app/api/ingest/email/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Payload = {
  messageId: string;
  fromEmail: string;
  subject?: string | null;
  text?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const p = (await req.json()) as Partial<Payload>;
    const messageId = p.messageId ?? "";
    const fromEmail = p.fromEmail ?? "";
    const subject = p.subject ?? null;
    const text = p.text ?? "";

    if (!messageId || !fromEmail) {
      return NextResponse.json({ ok: false, error: "Missing messageId/fromEmail" }, { status: 400 });
    }

    // Optional shared secret (only enforced if set on Vercel)
    if (process.env.INGEST_SHARED_SECRET) {
      const secret = req.headers.get("x-ingest-secret");
      if (secret !== process.env.INGEST_SHARED_SECRET) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE!, {
      auth: { persistSession: false },
    });

    // Idempotency: ignore if we've seen this messageId
    const seen = await supa.from("source_events").select("id").eq("id", messageId).maybeSingle();
    if (seen.data) return NextResponse.json({ ok: true, dedup: true });

    // Upsert contact by email
    const got = await supa.from("contacts").select("id").contains("emails", [fromEmail]).maybeSingle();

    let contactId = got.data?.id ?? null;
    if (!contactId) {
      const ins = await supa.from("contacts").insert({ emails: [fromEmail] }).select("id").single();
      if (ins.error || !ins.data) throw new Error(ins.error?.message ?? "Failed to create contact");
      contactId = ins.data.id;
    }

    // Create a conversation for this email (simple model: one per incoming email)
    const convRes = await supa
      .from("conversations")
      .insert({ contact_id: contactId, channel: "email", subject, status: "open" })
      .select("id")
      .single();
    if (convRes.error || !convRes.data) throw new Error(convRes.error?.message ?? "Failed to create conversation");
    const convId = convRes.data.id;

    // Store message
    const msgRes = await supa.from("messages").insert({
      conversation_id: convId,
      direction: "in",
      source: "import",
      body: text ?? "",
      channel_meta: { messageId, fromEmail },
    });
    if (msgRes.error) throw new Error(msgRes.error.message);

    // Mark source event for dedup
    const se = await supa.from("source_events").insert({ id: messageId, source: "gmail" });
    if (se.error) throw new Error(se.error.message);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Email ingest error:", err);
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}

// Handy to check the route exists in a browser:
export function GET() {
  return NextResponse.json({ ok: true, route: "/api/ingest/email" });
}
