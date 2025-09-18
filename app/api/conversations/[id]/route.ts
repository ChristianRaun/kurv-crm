// app/api/conversations/[id]/reply/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type RouteParams = { params: { id: string } };

function asWhatsApp(number: string) {
  const n = number.trim();
  return n.startsWith("whatsapp:") ? n : `whatsapp:${n}`;
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { id } = params;

    // Read form-encoded from <form> POST
    const form = await req.formData();
    const body = (form.get("body") as string | null)?.trim();
    if (!body) {
      return NextResponse.json({ ok: false, error: "Message body required" }, { status: 400 });
    }

    // Find conversation → contact phone
    const supa = supabaseServer();
    const { data: conv, error } = await supa
      .from("conversations")
      .select("id, contact:contacts(whatsapp, phones)")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!conv) return NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 404 });

    const toRaw = conv.contact?.whatsapp || conv.contact?.phones?.[0];
    if (!toRaw) {
      return NextResponse.json({ ok: false, error: "No destination phone on contact" }, { status: 400 });
    }

    // Call your existing /api/send/whatsapp endpoint (internal)
    const origin = new URL(req.url).origin;
    const sendRes = await fetch(`${origin}/api/send/whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: asWhatsApp(toRaw),
        body,
        conversation_id: id, // so the /send handler logs the message to same thread
      }),
    });

    if (!sendRes.ok) {
      const detail = await sendRes.json().catch(() => ({}));
      return NextResponse.json(
        { ok: false, error: detail?.error || "Send failed" },
        { status: 502 }
      );
    }

    // Redirect back to the thread view
    return NextResponse.redirect(new URL(`/conversations/${id}`, req.url), {
      status: 303,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
