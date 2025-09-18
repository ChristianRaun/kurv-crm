// app/conversations/[id]/page.tsx
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

type Message = {
  id: string;
  body: string | null;
  direction: "in" | "out";
  source: string | null;
  created_at: string;
  delivery_status?: string | null;
};

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

export default async function ConversationDetail({
  params,
}: {
  params: { id: string };
}) {
  const db = supa();

  // Fetch conversation + contact
  const { data: conv, error: cErr } = await db
    .from("conversations")
    .select("id, channel, status, contact:contacts(id, name, phones, whatsapp)")
    .eq("id", params.id)
    .maybeSingle();

  if (cErr || !conv) {
    return (
      <div className="p-6">
        <Link href="/conversations" className="text-sm text-blue-400">
          ← Back
        </Link>
        <div className="mt-4 text-red-400">
          {cErr ? cErr.message : "Conversation not found"}
        </div>
      </div>
    );
  }

  const contactLabel =
    conv.contact?.name ||
    conv.contact?.whatsapp ||
    conv.contact?.phones?.[0] ||
    "Unknown";

  // Fetch messages (newest last)
  const { data: messages, error: mErr } = await db
    .from("messages")
    .select("id, body, direction, source, created_at, delivery_status")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: true });

  if (mErr) {
    return (
      <div className="p-6 text-red-400">
        Error loading messages: {mErr.message}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <Link href="/conversations" className="text-sm text-blue-400">
          ← Back
        </Link>
        <div className="text-sm text-gray-400">
          Channel: {conv.channel} • Status: {conv.status ?? "open"}
        </div>
      </div>

      <h1 className="mt-2 text-2xl font-semibold">{contactLabel}</h1>

      <div className="mt-6 space-y-3">
        {(messages ?? []).map((m: Message) => {
          const isOut = m.direction === "out";
          return (
            <div
              key={m.id}
              className={`flex ${isOut ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                  isOut ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-100"
                }`}
              >
                <div>{m.body}</div>
                <div className="mt-1 text-[11px] opacity-70">
                  {new Date(m.created_at).toLocaleString()}
                  {isOut && m.delivery_status ? ` • ${m.delivery_status}` : ""}
                </div>
              </div>
            </div>
          );
        })}

        {(!messages || messages.length === 0) && (
          <div className="text-gray-400">No messages yet.</div>
        )}
      </div>
    </div>
  );
}
