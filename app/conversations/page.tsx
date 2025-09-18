// app/conversations/page.tsx
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

type Conversation = {
  id: string;
  channel: string;
  status: string | null;
  last_msg_at: string | null;
  contact: {
    id: string;
    name: string | null;
    phones: string[] | null;
    whatsapp: string | null;
  } | null;
  last_message: {
    body: string | null;
    direction: "in" | "out";
  } | null;
};

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

export default async function ConversationsPage() {
  const db = supa();

  // Grab recent conversations, join contact, and fetch 1 last message each
  // (two queries for clarity; simple and plenty fast for a small CRM)
  const { data: conversations, error } = await db
    .from("conversations")
    .select("id, channel, status, last_msg_at, contact:contacts(id, name, phones, whatsapp)")
    .order("last_msg_at", { ascending: false })
    .limit(50);

  if (error) {
    return <div className="p-6 text-red-400">Error: {error.message}</div>;
  }

  // Fetch last message for each conversation
  const withLast = await Promise.all(
    (conversations ?? []).map(async (c) => {
      const { data: lastMsg } = await db
        .from("messages")
        .select("body, direction")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { ...c, last_message: lastMsg ?? null } as Conversation;
    })
  );

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Conversations</h1>

      <div className="divide-y divide-gray-800 rounded-xl border border-gray-800">
        {withLast.map((row) => {
          const contactLabel =
            row?.contact?.name ||
            row?.contact?.whatsapp ||
            row?.contact?.phones?.[0] ||
            "Unknown";

          const lastPreview =
            (row.last_message?.direction === "out" ? "You: " : "") +
            (row.last_message?.body ?? "");

          return (
            <Link
              key={row.id}
              href={`/conversations/${row.id}`}
              className="block p-4 hover:bg-gray-900/50"
            >
              <div className="flex items-center justify-between">
                <div className="text-base font-medium">{contactLabel}</div>
                <div className="text-xs text-gray-400">{row.channel}</div>
              </div>
              <div className="mt-1 text-sm text-gray-300 line-clamp-1">{lastPreview}</div>
              <div className="mt-1 text-xs text-gray-500">
                {row.status ?? "open"} •{" "}
                {row.last_msg_at ? new Date(row.last_msg_at).toLocaleString() : "no messages yet"}
              </div>
            </Link>
          );
        })}

        {withLast.length === 0 && (
          <div className="p-6 text-gray-400">No conversations yet.</div>
        )}
      </div>
    </div>
  );
}
