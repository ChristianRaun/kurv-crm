// app/page.tsx
type Health = { ok: boolean; conversations: number };

export default async function Home() {
  let data: Health | null = null;

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/health`, {
      cache: "no-store",
    });
    data = (await res.json()) as Health;
  } catch {
    // ignore – show Not OK below
  }

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">kURVATUR CRM – Shell</h1>
      <div className="mt-4 p-4 border rounded">
        <p>API Health: {data?.ok ? "OK ✅" : "Not OK ❌"}</p>
        <p>Conversations in DB: {data?.conversations ?? "?"}</p>
      </div>
    </main>
  );
}
