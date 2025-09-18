// app/conversations/page.tsx
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

type ConversationRow = {
  id: string;
  channel: string;
  status: string | null;
  last_msg_at: string | null;
  contact: {
    id: string;
    name: string | null;
    phones: string[] | null;
  } | null;
};

type LastMessage = {
  body: string | null;
  direction: "in" | "out";
} | null;

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

export default async function ConversationsPage() {
  const db = supa();

  // 1) Fetch recent conversations w/ joined contact
  const { data, error } = await db
    .from("conversations")
    .select("id, channel, status, last_msg_at, contact:contacts(id, name, phones)")
    .order("last_msg_at", { ascending: false })
    .limit(50);

  if (error) {
    return <div className="p-6 text-red-400">Error: {error.message}</div>;
  }

  const conversations = (data ?? []) as ConversationRow[];

  // 2) For each conversation, fetch its latest message (simple and fine for now)
  const withLast: (ConversationRow & { last_message: LastMessage })[] =
    await Promise.all(
      conversations.map(async (c) => {
        const { data: lastMsg } = await db
          .from("messages")
          .select("body, direction")
          .eq("conversation_id", c.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        return { ...c, last_message: (lastMsg as LastMessage) ?? null };
      })
    );

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Conversations</h1>

      <div className="divide-y divide-gray-800 rounded-xl border border-gray-800">
        {withLast.map((row) => {
          const contactLabel =
            row?.contact?.name ||
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

              <div className="mt-1 text-sm text-gray-300 line-clamp-1">
                {lastPreview}
              </div>

              <div className="mt-1 text-xs text-gray-500">
                {row.status ?? "open"} •{" "}
                {row.last_msg_at
                  ? new Date(row.last_msg_at).toLocaleString()
                  : "no messages yet"}
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
