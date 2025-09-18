import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

/**
 * Twilio posts application/x-www-form-urlencoded with keys like:
 *  - MessageSid
 *  - MessageStatus  (queued|sent|delivered|failed|undelivered)
 *  - ErrorCode, ErrorMessage (sometimes)
 *  - To, From, etc.
 *
 * We'll (optionally) verify the Twilio signature and then update our message row.
 */

function verifyTwilioSignature({
  token,
  signature,
  url,
  params,
}: {
  token: string;
  signature: string | null;
  url: string;
  params: URLSearchParams;
}) {
  if (!signature) return false;

  // Build the expected signature: url + param keys sorted alpha + values
  const sorted = Array.from(params.keys()).sort();
  let data = url;
  for (const k of sorted) {
    data += k + params.get(k);
  }
  const digest = crypto.createHmac("sha1", token).update(data).digest("base64");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

export async function POST(req: Request) {
  try {
    const raw = await req.text(); // Twilio sends x-www-form-urlencoded
    const params = new URLSearchParams(raw);

    const messageSid = params.get("MessageSid");
    const messageStatus = params.get("MessageStatus"); // queued|sent|delivered|failed|undelivered
    const errorCode = params.get("ErrorCode");
    const errorMessage = params.get("ErrorMessage");

    if (!messageSid) {
      return NextResponse.json({ ok: false, error: "Missing MessageSid" }, { status: 400 });
    }

    // (Optional) Verify Twilio signature
    // NOTE: The exact URL must match what Twilio calls (prod URL). If you use Vercel preview domains,
    // either skip verification there or compute dynamically using X-Forwarded-* headers.
    const signature = req.headers.get("x-twilio-signature");
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const publicUrl = process.env.NEXT_PUBLIC_BASE_URL || ""; // e.g. https://kurv-crm.vercel.app
    const webhookUrl = `${publicUrl}/api/twilio/status`;

    // If publicUrl is set, try validation; otherwise skip.
    if (publicUrl) {
      const ok = verifyTwilioSignature({
        token: authToken,
        signature,
        url: webhookUrl,
        params,
      });
      if (!ok) {
        // You can log but still accept if you prefer during development:
        // return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 403 });
        console.warn("Twilio signature failed verification; continuing (dev mode).");
      }
    }

    const supa = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!,
      { auth: { persistSession: false } }
    );

    // Update the message row by Twilio SID stored in channel_meta->>'sid'
    const { error } = await supa
      .from("messages")
      .update({
        delivery_status: messageStatus ?? null,
        delivery_at: ["delivered", "failed", "undelivered"].includes(messageStatus || "")
          ? new Date().toISOString()
          : null,
        delivery_error_code: errorCode,
        delivery_error_message: errorMessage,
      })
      .eq("source", "twilio")
      .eq("direction", "out")
      .eq("channel_meta->>sid", messageSid);

    if (error) {
      console.error("Supabase update error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Optional: store raw event for debugging / auditing
    await supa.from("source_events").insert({
      source: "twilio_status",
      payload: Object.fromEntries(params.entries()),
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Status webhook error:", e);
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

// For a quick "is the route alive?" check
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/twilio/status" });
}
