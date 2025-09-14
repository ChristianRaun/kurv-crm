import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData(); // Twilio sends form-encoded
    const sid = String(form.get("SmsMessageSid") ?? "");
    const from = String(form.get("From") ?? "").replace("whatsapp:", "");
    const body = String(form.get("Body") ?? "");

    if (!sid || !from) return NextResponse.json({ ok:false, error:"Missing sid/from" }, { status:400 });

    // Optional shared secret check
    const secret = req.headers.get("x-ingest-secret");
    if (process.env.INGEST_SHARED_SECRET && secret !== process.env.INGEST_SHARED_SECRET) {
      return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });
    }

    const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE!, { auth:{ persistSession:false }});

    // Idempotency
    const seen = await supa.from("source_events").select("id").eq("id", sid).maybeSingle();
    if (seen.data) return NextResponse.json({ ok:true, dedup:true });

    // Contact upsert
    const got = await supa.from("contacts").select("id").contains("phones", [from]).maybeSingle();
    const contact = got.data ?? (await supa.from("contacts").insert({ phones:[from] }).select("id").single()).data;

    // Find latest convo on this channel or create
    let conv = (await supa.from("conversations")
      .select("id").eq("contact_id", contact.id).eq("channel","whatsapp")
      .order("last_msg_at",{ ascending:false }).limit(1).maybeSingle()).data;

    if (!conv) {
      conv = (await supa.from("conversations")
        .insert({ contact_id:contact.id, channel:"whatsapp", status:"open" })
        .select("id").single()).data;
    }

    // Store message
    await supa.from("messages").insert({
      conversation_id: conv!.id,
      direction: "in",
      source: "import",
      body,
      channel_meta: { sid, from }
    });

    await supa.from("conversations").update({ last_msg_at: new Date().toISOString(), status:"open" }).eq("id", conv!.id);
    await supa.from("source_events").insert({ id: sid, source: "twilio" });

    return NextResponse.json({ ok:true });
  } catch (err:any) {
    return NextResponse.json({ ok:false, error:String(err?.message ?? err) }, { status:500 });
  }
}
