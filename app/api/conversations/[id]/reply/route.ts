import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

// context.params is a *Promise* in Next 15 route handlers
type RouteContext = { params: Promise<{ id: string }> };

function asWhatsApp(n: string) {
  const s = n.trim();
  return s.startsWith("whatsapp:") ? s : `whatsapp:${s}`;
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    // 👇 await the params (this is what your build error was about)
    const { id: convId } = await context.params;

    // ---- Read body as JSON or form-data, with raw-text fallback
    let bodyText: string | null = null;
    const ctype = req.headers.get("content-type") || "";

    if (ctype.includes("application/json")) {
      const js = await req.json().catch(() => null);
      bodyText =
        js && typeof js.body === "string" ? (js.body as string).trim() : null;
    } else if (ctype.includes("application/x-www-form-urlencoded")) {
      const fd = await req.formData();
      const v = fd.get("body");
      bodyText = v ? String(v).trim() : null;
    } else {
      const txt = (await req.text()) || "";
      try {
        const js = JSON.parse(txt);
        bodyText =
          js && typeof js.body === "string" ? (js.body as string).trim() : null;
      } catch {
        bodyText = txt.trim() || null;
      }
    }

    if (!bodyText) {
      return NextResponse.json(
        { ok: false, error: "Message body required" },
        { status: 400 }
      );
    }

    // ---- Load conversation + contact
    const supa = supabaseServer();
    const { data: conv, error } = await supa
      .from("conversations")
      .select("id, contact:contacts(id, whatsapp, phones)")
      .eq("id", convId)
      .maybeSingle();

    if (error) throw error;
    if (!conv) {
      return NextResponse.json(
        { ok: false, error: "Conversation not found" },
        { status: 404 }
      );
    }

    const toRaw: string | null =
      (conv as any).contact?.whatsapp ||
      (Array.isArray((conv as any).contact?.phones)
        ? (conv as any).contact.phones[0]
        : null);

    if (!toRaw) {
      return NextResponse.json(
        { ok: false, error: "No destination phone on contact" },
        { status: 400 }
      );
    }

    // Use configured base URL if present; otherwise use current origin
    const origin =
      process.env.NEXT_PUBLIC_BASE_URL || new URL("/", req.url).origin;

    const sendRes = await fetch(`${origin}/api/send/whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: asWhatsApp(toRaw),
        body: bodyText,
        conversation_id: convId,
      }),
    });

    const js = await sendRes.json().catch(() => ({} as any));
    if (!sendRes.ok) {
      return NextResponse.json(
        { ok: false, error: js?.error || "Send failed" },
        { status: sendRes.status }
      );
    }

    return NextResponse.json({ ok: true, ...js });
  } catch (e: any) {
    console.error("reply route error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
