import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { to, body, conversation_id } = await req.json();

    if (!to || !body) {
      return NextResponse.json({ ok: false, error: "Missing to/body" }, { status: 400 });
    }

    // ---- Twilio send ----
    const sid   = process.env.TWILIO_ACCOUNT_SID!;
    const token = process.env.TWILIO_AUTH_TOKEN!;
    const from  = process.env.TWILIO_WHATSAPP_FROM!; // e.g. whatsapp:+14155238886

    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
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
      // Twilio error details in tw.message (helpful!)
      return NextResponse.json({ ok: false, error: tw?.message || "Twilio error" }, { status: 502 });
    }

    // ---- Log to Supabase ----
    const supa = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!,
      { auth: { persistSession: false } }
    );

    let convId = conversation_id as string | undefined;

    // Try to reuse/create conversation by 'to' contact
    if (!convId) {
      const toPhone = to.replace("whatsapp:", "");
      const contact = (await supa
        .from("contacts")
        .select("id")
        .contains("phones", [toPhone])
        .maybeSingle()).data;

      if (contact?.id) {
        const conv = (await supa
          .from("conversations")
          .select("id")
          .eq("contact_id", contact.id)
          .eq("channel", "whatsapp")
          .order("last_msg_at", { ascending: false })
          .limit(1)
          .maybeSingle()).data;

        if (conv?.id) convId = conv.id;
        else {
          const created = await supa
            .from("conversations")
            .insert({ contact_id: contact.id, channel: "whatsapp", status: "open" })
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
      await supa.from("conversations").update({ last_msg_at: new Date().toISOString() }).eq("id", convId);
    }

    return NextResponse.json({ ok: true, sid: tw.sid, conversation_id: convId ?? null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

// Optional GET to quick-check the route works
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/send/whatsapp" });
}
