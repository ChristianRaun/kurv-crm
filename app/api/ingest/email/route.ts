import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const p = await req.json();
    const { messageId, fromEmail, subject, text } = p || {};
    if (!messageId || !fromEmail) return NextResponse.json({ ok:false, error:"Missing messageId/fromEmail" }, { status:400 });

    if (process.env.INGEST_SHARED_SECRET) {
      const secret = req.headers.get("x-ingest-secret");
      if (secret !== process.env.INGEST_SHARED_SECRET) {
        return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });
      }
    }

    const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE!, { auth:{ persistSession:false }});

    const seen = await supa.from("source_events").select("id").eq("id", messageId).maybeSingle();
    if (seen.data) return NextResponse.json({ ok:true, dedup:true });

    const got = await supa.from("contacts").select("id").contains("emails",[fromEmail]).maybeSingle();
    const contact = got.data ?? (await supa.from("contacts").insert({ emails:[fromEmail] }).select("id").single()).data;

    const conv = (await supa.from("conversations")
      .insert({ contact_id:contact.id, channel:"email", subject: subject ?? null, status:"open" })
      .select("id").single()).data;

    await supa.from("messages").insert({
      conversation_id: conv.id,
      direction: "in",
      source: "import",
      body: text ?? "",
      channel_meta: { messageId, fromEmail }
    });

    await supa.from("source_events").insert({ id: messageId, source: "gmail" });

    return NextResponse.json({ ok:true });
  } catch (err:any) {
    return NextResponse.json({ ok:false, error:String(err?.message ?? err) }, { status:500 });
  }
}
