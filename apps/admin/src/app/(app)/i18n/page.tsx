'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, Td, Th } from '@/components/ui/table';
import { api, ApiError, errorText } from '@/lib/api/client';

type Report = {
  mode: string;
  valid: boolean;
  applied: boolean;
  newLanguages: string[];
  newKeys: string[];
  changedKeys: Array<{ key: string; lang: string; before: string | null; after: string }>;
  unchangedCount: number;
  errors?: Array<{ row?: number; key?: string; message: string }>;
  [k: string]: unknown;
};

/** docs/06 §2.3 item 9: languages on/off, xlsx/csv import (dry-run →
 * apply), xlsx export — over the file-01 §9 API. */
export default function I18nPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const langs = useQuery({
    queryKey: ['languages'],
    queryFn: async () => (await api.GET('/admin/i18n/languages')).data!.data,
  });
  const toggle = useMutation({
    mutationFn: (v: { code: string; isActive: boolean }) =>
      api.PATCH('/admin/i18n/languages/{code}', { params: { path: { code: v.code } }, body: { isActive: v.isActive } }),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['languages'] });
    },
    onError: (e) => setError(errorText(e)),
  });
  const upload = useMutation({
    mutationFn: async (mode: 'dry-run' | 'apply') => {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new ApiError(400, 'VALIDATION_ERROR', 'Выберите файл');
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/proxy/i18n/import?mode=${mode}`, { method: 'POST', body: form });
      const body = (await res.json()) as { data?: Report; error?: { code: string; message: string; details?: Record<string, unknown> } };
      if (!res.ok) throw new ApiError(res.status, body.error?.code ?? 'INTERNAL_ERROR', body.error?.message ?? '', body.error?.details);
      return body.data!;
    },
    onSuccess: (r) => {
      setError(null);
      setReport(r);
      if (r.applied) void qc.invalidateQueries({ queryKey: ['languages'] });
    },
    onError: (e) => setError(errorText(e)),
  });

  return (
    <>
      <PageHeader
        title="Локализация"
        subtitle="Языки, импорт xlsx/csv (сначала dry-run с отчётом, затем apply), экспорт."
        actions={
          // A file download from a route handler, not an app page.
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a href="/api/proxy/i18n/export" className="inline-flex h-9 items-center rounded-[var(--radius-md)] border border-line bg-surface px-3 text-sm hover:bg-canvas">
            Экспорт xlsx
          </a>
        }
      />
      <ErrorNote text={error ?? (langs.error ? errorText(langs.error) : null)} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Table>
            <thead>
              <tr>
                <Th>Код</Th>
                <Th>Название</Th>
                <Th>Переводов</Th>
                <Th>Бандл</Th>
                <Th>Состояние</Th>
              </tr>
            </thead>
            <tbody>
              {(langs.data ?? []).map((l) => (
                <tr key={l.code}>
                  <Td className="font-mono">{l.code}{l.isRtl ? ' · RTL' : ''}</Td>
                  <Td>{l.nameNative}</Td>
                  <Td>{l.translations}</Td>
                  <Td>v{l.bundleVersion}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Badge tone={l.isActive ? 'success' : 'neutral'}>{l.isActive ? 'включён' : 'выключен'}</Badge>
                      <Button size="sm" variant="outline" disabled={toggle.isPending || l.code === 'en'} onClick={() => toggle.mutate({ code: l.code, isActive: !l.isActive })}>
                        {l.isActive ? 'Выключить' : 'Включить'}
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Импорт переводов</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <input ref={fileRef} type="file" accept=".xlsx,.csv" className="block w-full text-sm" />
            <div className="flex gap-2">
              <Button variant="outline" disabled={upload.isPending} onClick={() => upload.mutate('dry-run')}>
                Dry-run
              </Button>
              <Button disabled={upload.isPending || !report?.valid || report.applied} onClick={() => upload.mutate('apply')}>
                Apply
              </Button>
            </div>
            {report ? (
              <div className="space-y-1 rounded-md bg-canvas p-3 text-xs">
                <div>
                  <b>{report.mode}</b> · {report.valid ? 'валиден' : 'ошибки'} · {report.applied ? 'применён' : 'не применён'}
                </div>
                <div>Новые языки: {report.newLanguages.join(', ') || '—'}</div>
                <div>Новые ключи: {report.newKeys.length}</div>
                <div>Изменённые: {report.changedKeys.length} · без изменений: {report.unchangedCount}</div>
                {report.errors?.length ? (
                  <ul className="mt-1 list-disc pl-4 text-danger">
                    {report.errors.slice(0, 20).map((e, i) => (
                      <li key={i}>
                        {e.row ? `строка ${e.row}: ` : ''}
                        {e.key ? `${e.key}: ` : ''}
                        {e.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
