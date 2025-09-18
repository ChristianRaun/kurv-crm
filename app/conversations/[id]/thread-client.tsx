// app/conversations/[id]/thread-client.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Message = {
  id: string;
  conversation_id: string;
  direction: "in" | "out";
  body: string;
  created_at: string;
  channel_meta: any;
};

export default function ThreadClient({
  conversationId,
  to,
  initialMessages,
}: {
  conversationId: string;
  to?: string; // destination number (plain E.164 like +1..., we’ll add whatsapp: in API)
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  // Optional Realtime subscription for new messages in this conversation
  useEffect(() => {
    const supa = supabaseBrowser();
    const chan = supa
      .channel(`msg-thread-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: any) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supa.removeChannel(chan);
    };
  }, [conversationId]);

  async function send() {
    if (!body.trim()) return;
    if (!to) {
      alert("No destination phone is set for this conversation.");
      return;
    }

    const text = body.trim();
    setBody("");

    // Optimistic
    const temp: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: conversationId,
      direction: "out",
      body: text,
      created_at: new Date().toISOString(),
      channel_meta: null,
    };
    setMessages((prev) => [...prev, temp]);

    try {
      setSending(true);
      const res = await fetch("/api/send/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,                         // plain phone; server turns into whatsapp:+x...
          body: text,
          conversation_id: conversationId,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        alert(`Send failed: ${json?.error || "Unknown error"}`);
      }
    } catch (e: any) {
      alert(`Send failed: ${e?.message || String(e)}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* invisible anchor for auto-scroll */}
      <div ref={listRef} />

      <div className="sticky bottom-0 bg-black/40 backdrop-blur border-t border-neutral-800 pt-3">
        <div className="flex gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type a message…"
            rows={2}
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
          />
          <button
            onClick={send}
            disabled={sending || !body.trim()}
            className="shrink-0 rounded bg-blue-600 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
        {!to && (
          <p className="mt-1 text-xs text-yellow-400">
            No destination phone found on contact. Add a phone in Supabase
            `contacts.phones` for this conversation’s contact.
          </p>
        )}
      </div>
    </>
  );
}
