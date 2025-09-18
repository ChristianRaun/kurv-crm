// app/page.tsx
import Link from 'next/link';

export default function Page() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">kURVATUR CRM — Shell</h1>
      <div className="mt-4">
        <Link href="/conversations" className="text-blue-400 underline">
          View Conversations →
        </Link>
      </div>
    </main>
  );
}
