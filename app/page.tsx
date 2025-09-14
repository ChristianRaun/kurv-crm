// app/page.tsx
export default async function Home() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/health`, {
    cache: "no-store",
  }).catch(() => null);

  const data = res ? await res.json() : null;

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
