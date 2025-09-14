import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const p = await req.json();
    const { callSid, from, summary, recordingUrl } = p || {};
    if (!callSid || !from) return NextResponse.json({ ok:false, error:"Missing callSid/from" }, { status:400 });

    if (process.env.INGEST_SHARED_SECRET) {
      const secret = req.headers.get("x-ingest-secret");
      if (secret !== process.env.INGEST_SHARED_SECRET) {
        return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });
      }
    }

    const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE!, { auth:{ persistSession:false }});

    const seen = await supa.from("source_events").select("id").eq("id", callSid).maybeSingle();
    if (seen.data) return NextResponse.json({ ok:true, dedup:true });

    const got = await supa.from("contacts").select("id").contains("phones",[from]).maybeSingle();
    const contact = got.data ?? (await supa.from("contacts").insert({ phones:[from] }).select("id").single()).data;

    let conv = (await supa.from("conversations")
      .select("id").eq("contact_id", contact.id).eq("channel","phone")
      .order("last_msg_at",{ ascending:false }).limit(1).maybeSingle()).data;

    if (!conv) {
      conv = (await supa.from("conversations")
        .insert({ contact_id:contact.id, channel:"phone", status:"open" })
        .select("id").single()).data;
    }

    await supa.from("messages").insert({
      conversation_id: conv!.id,
      direction: "in",
      source: "import",
      body: summary ?? "Incoming call",
      channel_meta: { callSid, recordingUrl }
    });

    await supa.from("conversations").update({ last_msg_at: new Date().toISOString(), status:"open" }).eq("id", conv!.id);
    await supa.from("source_events").insert({ id: callSid, source: "twilio" });

    return NextResponse.json({ ok:true });
  } catch (err:any) {
    return NextResponse.json({ ok:false, error:String(err?.message ?? err) }, { status:500 });
  }
}
