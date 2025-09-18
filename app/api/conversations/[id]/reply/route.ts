// app/api/conversations/[id]/reply/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";


async function readBody(req: Request): Promise<string> {
  // Try JSON first
  try {
    const j = await req.json();
    if (j && typeof j.body === "string") return j.body.trim();
  } catch (_) {
    /* fall through */
  }

  // Fallback to form-encoded / multipart
  try {
    const form = await req.formData();
    const body = form.get("body");
    if (typeof body === "string") return body.trim();
  } catch (_) {
    /* fall through */
  }

  return "";
}



type RouteParams = { params: { id: string } };

function asWhatsapp(n: string) {
  return n.startsWith("whatsapp:") ? n : `whatsapp:${n}`;
}

export async function POST(req: Request, { params }: RouteParams) {
const body = await readBody(req);


  try {
    const { id } = params;

    // 👇 parse JSON body (this matches your fetch on the thread page)
    const { body } = await req.json();
    if (!body || !String(body).trim()) {
      return NextResponse.json({ ok: false, error: "Message body required" }, { status: 400 });
    }

    // Find conversation + contact phone/whatsapp
    const supa = supabaseServer();
    const { data: conv, error } = await supa
      .from("conversations")
      .select("id, contact:contacts(whatsapp, phones)")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!conv) {
      return NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 404 });
    }

    // ✅ fix: use contact, not contact2
    const toRaw: string | undefined = conv.contact?.whatsapp || conv.contact?.phones?.[0];
    if (!toRaw) {
      return NextResponse.json({ ok: false, error: "No destination phone on contact" }, { status: 400 });
    }

    // Call your existing /api/send/whatsapp
    const origin = new URL(req.url).origin;
    const sendRes = await fetch(`${origin}/api/send/whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: asWhatsapp(toRaw),
        body,
        conversation_id: id, // ensures the send route logs to this same thread
      }),
    });

    const sendJson = await sendRes.json();
    if (!sendRes.ok) {
      return NextResponse.json(
        { ok: false, error: sendJson?.error ?? "Send failed" },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, sid: sendJson.sid });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
