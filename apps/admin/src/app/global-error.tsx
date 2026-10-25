'use client';

import { useEffect } from 'react';
import { reportRenderError } from '@/lib/report-error';
import './globals.css';

/** S18-4: the last net — the root layout itself crashed. Plain page. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportRenderError(error);
  }, [error]);
  return (
    <html lang="ru">
      <body className="min-h-screen">
        <main className="mx-auto max-w-md p-8">
          <h1 className="font-serif text-2xl font-semibold">Админка не открылась</h1>
          <p className="mt-2 text-sm">Что-то сломалось. Попробуйте ещё раз или обновите страницу.</p>
          <button type="button" className="mt-4 rounded-md border px-4 py-2 text-sm" onClick={reset}>
            Попробовать ещё раз
          </button>
        </main>
      </body>
    </html>
  );
}
