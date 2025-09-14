// app/page.tsx
export default async function Home() {
  let data: any = null;
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    data = await res.json();
  } catch (e) {
    // ignore – will render Not OK below
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
