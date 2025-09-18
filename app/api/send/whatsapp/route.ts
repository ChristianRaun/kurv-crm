// app/api/send/whatsapp/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs"; // ensure Node runtime (not Edge)

export async function POST(req: Request) {
  try {
    const { to, body, conversation_id } = await req.json();

    if (!to || !body) {
      return NextResponse.json(
        { ok: false, error: "Missing 'to' or 'body'" },
        { status: 400 }
      );
    }

    // ---- Env checks ----
    const sid   = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from  = process.env.TWILIO_WHATSAPP_FROM; // e.g. "whatsapp:+14155238886"

    if (!sid || !token || !from) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing Twilio env vars. Required: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM",
        },
        { status: 500 }
      );
    }

    // ---- Twilio send ----
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${auth}`,
        },
        body: new URLSearchParams({
          From: from,
          To: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
          Body: body,
        }).toString(),
      }
    );

    const tw = await twilioRes.json();
    if (!twilioRes.ok) {
      // Twilio sends useful messages in "message"
      return NextResponse.json(
        { ok: false, error: tw?.message || "Twilio error", details: tw },
        { status: 502 }
      );
    }

    // ---- Log to Supabase ----
    const supaUrl = process.env.SUPABASE_URL;
    const supaKey = process.env.SUPABASE_SERVICE_ROLE;
    if (!supaUrl || !supaKey) {
      // Log send succeeded even if we can't log it in DB
      return NextResponse.json({
        ok: true,
        sid: tw.sid,
        warning: "Missing Supabase env vars; message sent but not logged",
      });
    }

    const supa = createClient(supaUrl, supaKey, { auth: { persistSession: false } });

    let convId: string | undefined = conversation_id;

    // Try to reuse/create conversation by 'to' contact
    if (!convId) {
      const toPhone = to.replace("whatsapp:", ""); // keep "+" if present
      const contact = (
        await supa
          .from("contacts")
          .select("id")
          .contains("phones", [toPhone])
          .maybeSingle()
      ).data;

      if (contact?.id) {
        const conv = (
          await supa
            .from("conversations")
            .select("id")
            .eq("contact_id", contact.id)
            .eq("channel", "whatsapp")
            .order("last_msg_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        ).data;

        if (conv?.id) {
          convId = conv.id;
        } else {
          const created = await supa
            .from("conversations")
            .insert({
              contact_id: contact.id,
              channel: "whatsapp",
              status: "open",
            })
            .select("id")
            .single();
          convId = created.data?.id;
        }
      }
    }

    if (convId) {
      await supa.from("messages").insert({
        conversation_id: convId,
        direction: "out",
        source: "twilio",
        body,
        channel_meta: { sid: tw.sid, to },
      });
      await supa
        .from("conversations")
        .update({ last_msg_at: new Date().toISOString() })
        .eq("id", convId);
    }

    return NextResponse.json({ ok: true, sid: tw.sid, conversation_id: convId ?? null });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/send/whatsapp" });
}
