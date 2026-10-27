'use client';

import { useEffect } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { reportRenderError } from '@/lib/report-error';

/** S18-4: a crash inside one page keeps the sidebar and offers a retry. */
export default function AppError({
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
    <div>
      <PageHeader title="Страница не открылась" />
      <ErrorNote text="Что-то сломалось на этой странице. Ошибка уже отправлена разработчикам." />
      <div className="mt-4 flex gap-2">
        <Button onClick={reset}>Попробовать ещё раз</Button>
        <Button variant="outline" onClick={() => window.location.assign('/')}>
          На главную
        </Button>
      </div>
    </div>
  );
}
