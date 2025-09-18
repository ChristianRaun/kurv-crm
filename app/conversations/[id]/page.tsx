// app/conversations/[id]/page.tsx
import { supabaseServer } from "@/lib/supabaseServer";
import ThreadClient from "./thread-client";

type Params = { params: { id: string } };

export default async function ConversationThread({ params }: Params) {
  const supa = supabaseServer();

  // 1) Get conversation with its contact (to know where to reply)
  //    We assume contacts.phones holds phone numbers; take first by default.
  const { data: convo, error: convoErr } = await supa
    .from("conversations")
    .select(`
      id,
      channel,
      status,
      contact:contacts ( id, phones )
    `)
    .eq("id", params.id)
    .maybeSingle();

  if (convoErr || !convo) {
    return <div className="p-6 text-red-400">Conversation not found.</div>;
  }

  // Determine the "to" phone (destination). Adjust if you store WhatsApp separately.
  const toPhone =
    (Array.isArray(convo.contact?.phones) && convo.contact?.phones[0]) ||
    undefined;

  // 2) Fetch messages in ascending order
  const { data: messages, error: msgErr } = await supa
    .from("messages")
    .select(`id, conversation_id, direction, body, created_at, channel_meta`)
    .eq("conversation_id", params.id)
    .order("created_at", { ascending: true });

  if (msgErr) {
    return <div className="p-6 text-red-400">Failed to load messages.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Thread</h1>
          <p className="text-sm text-neutral-400">
            {convo.channel} • {convo.status}
          </p>
        </div>
      </header>

      {/* Messages */}
      <div className="space-y-2">
        {messages?.map((m) => (
          <div
            key={m.id}
            className={`rounded px-3 py-2 max-w-[75%] ${
              m.direction === "in"
                ? "bg-neutral-800 text-neutral-100"
                : "bg-blue-600 text-white ml-auto"
            }`}
          >
            <div className="whitespace-pre-wrap">{m.body}</div>
            <div className="mt-1 text-[11px] opacity-75">
              {new Date(m.created_at).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* Composer (client) */}
      <ThreadClient
        conversationId={convo.id}
        to={toPhone}                 // e.g. "+971522390864"
        initialMessages={messages ?? []}
      />
    </div>
  );
}
