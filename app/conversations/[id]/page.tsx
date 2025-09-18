// app/conversations/[id]/page.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import { notFound } from "next/navigation";

type Params = { params: { id: string } };

export const dynamic = "force-dynamic";

export default async function ThreadPage({ params }: Params) {
  const { id } = params;
  const supa = supabaseServer();

  // Conversation + contact
  const { data: conv } = await supa
    .from("conversations")
    .select("id, channel, status, last_msg_at, contact:contacts(id, name, phones, whatsapp)")
    .eq("id", id)
    .maybeSingle();

  if (!conv) return notFound();

  // Messages
  const { data: msgs } = await supa
    .from("messages")
    .select("id, body, direction, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  const contactLabel =
    conv?.contact?.name ||
    conv?.contact?.whatsapp ||
    conv?.contact?.phones?.[0] ||
    "Unknown";

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/conversations" className="text-blue-400 hover:underline">
          ← Back
        </Link>
        <div className="text-sm text-gray-400">{conv.channel}</div>
      </div>

      <h1 className="text-2xl font-semibold">{contactLabel}</h1>
      <div className="text-xs text-gray-500">
        {conv.status ?? "open"} •{" "}
        {conv.last_msg_at ? new Date(conv.last_msg_at).toLocaleString() : "no messages yet"}
      </div>

      {/* Messages */}
      <div className="rounded-xl border border-gray-800 p-4 space-y-3 bg-black/30">
        {(msgs ?? []).map((m) => (
          <div
            key={m.id}
            className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                m.direction === "out"
                  ? "bg-blue-600/80 text-white"
                  : "bg-gray-800 text-gray-100"
              }`}
            >
              <div>{m.body}</div>
              <div className="mt-1 text-[10px] opacity-70">
                {new Date(m.created_at).toLocaleString()}
              </div>
            </div>
          </div>
        ))}

        {(msgs ?? []).length === 0 && (
          <div className="text-sm text-gray-400">No messages yet.</div>
        )}
      </div>

      {/* Reply form – posts to /api/conversations/[id]/reply and then redirects back */}
      <form
        action={`/api/conversations/${id}/reply`}
        method="POST"
        className="rounded-xl border border-gray-800 p-4 space-y-3"
      >
        <label className="block text-sm text-gray-400">Reply</label>
        <textarea
          name="body"
          rows={3}
          required
          placeholder="Type your message…"
          className="w-full rounded-md bg-black/40 border border-gray-700 p-2 outline-none focus:border-blue-500"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
