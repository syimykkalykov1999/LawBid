import Link from 'next/link';

/** D-14: unknown admin URL — a plain page with a way back. */
export default function NotFound() {
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="font-serif text-2xl font-semibold">Страница не найдена</h1>
      <p className="mt-2 text-sm">Такого раздела нет или ссылка устарела.</p>
      <Link href="/" className="mt-4 inline-block rounded-md border px-4 py-2 text-sm">
        На главную
      </Link>
    </main>
  );
}
