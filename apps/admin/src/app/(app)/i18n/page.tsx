'use client';

import { DownloadSimple, FileArrowUp, Translate } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useConfirm } from '@/components/legacy/confirm';
import { FadeIn, MotionRow } from '@/components/legacy/fade-in';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
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

/** Identity of a picked file: the dry-run report only applies to the same one. */
const fileKey = (f: File) => `${f.name}:${f.size}:${f.lastModified}`;

/** docs/06 §2.3 item 9: languages on/off, xlsx/csv import (dry-run →
 * apply), xlsx export — over the file-01 §9 API. */
export default function I18nPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<{ key: string; data: Report } | null>(null);
  const langs = useQuery({
    queryKey: ['languages'],
    queryFn: async () => (await api.GET('/admin/i18n/languages')).data!.data,
  });
  const toggle = useMutation({
    mutationFn: async (v: { code: string; name: string; isActive: boolean }) => {
      const ok = await confirm({
        title: v.isActive ? `Включить ${v.name}?` : `Выключить ${v.name}?`,
        description: v.isActive
          ? 'Язык появится в выборе языка в приложениях.'
          : 'Язык пропадёт из выбора; у тех, кто им пользуется, интерфейс переключится на английский.',
        confirm: v.isActive ? 'Включить' : 'Выключить',
        danger: !v.isActive,
      });
      if (!ok) return null;
      await api.PATCH('/admin/i18n/languages/{code}', { params: { path: { code: v.code } }, body: { isActive: v.isActive } });
      return v;
    },
    onSuccess: (v) => {
      if (!v) return;
      toast.success(`${v.name}: ${v.isActive ? 'включён' : 'выключен'}`);
      void qc.invalidateQueries({ queryKey: ['languages'] });
    },
    onError: (e) => toast.error(e),
  });
  const upload = useMutation({
    mutationFn: async (mode: 'dry-run' | 'apply') => {
      if (!file) throw new ApiError(400, 'VALIDATION_ERROR', 'Выберите файл');
      const key = fileKey(file);
      if (mode === 'apply' && (report?.key !== key || !report.data.valid)) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Сначала проверьте этот файл (dry-run).');
      }
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/proxy/i18n/import?mode=${mode}`, { method: 'POST', body: form });
      const body = (await res.json().catch(() => ({}))) as {
        data?: Report;
        error?: { code: string; message: string; details?: Record<string, unknown> };
      };
      if (!res.ok) throw new ApiError(res.status, body.error?.code ?? 'INTERNAL_ERROR', body.error?.message ?? `HTTP ${res.status}`, body.error?.details);
      return { key, data: body.data! };
    },
    onSuccess: (r) => {
      setReport(r);
      if (r.data.applied) {
        toast.success('Переводы применены');
        void qc.invalidateQueries({ queryKey: ['languages'] });
      } else if (r.data.valid) {
        toast.success('Проверка пройдена — можно применять');
      } else {
        toast.error('В файле есть ошибки — см. отчёт');
      }
    },
    onError: (e) => toast.error(e),
  });

  const rows = langs.data ?? [];
  const r = report?.data;
  const sameFile = !!file && report?.key === fileKey(file);
  const canApply = sameFile && !!r?.valid && !r.applied;

  return (
    <>
      {dialog}
      <PageHeader
        eyebrow="Система"
        title="Локализация"
        subtitle="Языки приложения, импорт переводов xlsx/csv (сначала проверка с отчётом, затем применение) и экспорт."
        actions={
          // A file download from a route handler, not an app page.
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a href="/api/proxy/i18n/export" className={buttonVariants({ variant: 'outline' })}>
            <DownloadSimple size={16} weight="light" />
            Экспорт xlsx
          </a>
        }
      />
      <ErrorNote text={langs.error ? errorText(langs.error) : null} />
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
              {langs.isPending ? <TableEmpty colSpan={5} loading /> : null}
              {!langs.isPending && !langs.error && rows.length === 0 ? (
                <TableEmpty colSpan={5}>
                  <span className="inline-flex items-center gap-2">
                    <Translate size={16} weight="light" /> Языков пока нет — загрузите файл с переводами.
                  </span>
                </TableEmpty>
              ) : null}
              {rows.map((l, i) => (
                <MotionRow key={l.code} i={i}>
                  <Td className="font-mono">
                    {l.code}
                    {l.isRtl ? <span className="ml-1 text-xs text-faint">RTL</span> : null}
                  </Td>
                  <Td className="text-ink">{l.nameNative}</Td>
                  <Td className="tabular-nums">{l.translations}</Td>
                  <Td className="font-mono text-xs text-muted">v{l.bundleVersion}</Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={l.isActive}
                        disabled={toggle.isPending || l.code === 'en'}
                        label={l.nameNative}
                        onChange={(v) => toggle.mutate({ code: l.code, name: l.nameNative, isActive: v })}
                      />
                      <Badge tone={l.isActive ? 'success' : 'neutral'} dot={l.isActive}>
                        {l.isActive ? 'включён' : 'выключен'}
                      </Badge>
                    </div>
                  </Td>
                </MotionRow>
              ))}
            </tbody>
          </Table>
        </div>
        <FadeIn i={1}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Импорт переводов</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface-2 px-3 py-3 transition-colors hover:bg-accent-soft">
                <FileArrowUp size={20} weight="light" className="text-gold-600" />
                <span className="min-w-0 flex-1 truncate text-ink">{file ? file.name : 'Выберите .xlsx или .csv'}</span>
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  className="sr-only"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    // A new file needs its own dry run.
                    setReport(null);
                  }}
                />
              </label>
              <div className="flex gap-2">
                <Button variant="outline" disabled={!file} loading={upload.isPending && upload.variables === 'dry-run'} onClick={() => upload.mutate('dry-run')}>
                  Проверить (dry-run)
                </Button>
                <Button disabled={!canApply} loading={upload.isPending && upload.variables === 'apply'} onClick={() => upload.mutate('apply')}>
                  Применить
                </Button>
              </div>
              {file && !sameFile ? <p className="text-xs text-faint">Применить можно только файл, прошедший проверку.</p> : null}
              {r ? (
                <div className="space-y-1 rounded-xl bg-surface-2 p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={r.valid ? 'success' : 'danger'} dot>
                      {r.valid ? 'без ошибок' : 'есть ошибки'}
                    </Badge>
                    <Badge tone={r.applied ? 'success' : 'neutral'}>{r.applied ? 'применён' : 'не применён'}</Badge>
                  </div>
                  <div>Новые языки: {r.newLanguages.join(', ') || '—'}</div>
                  <div>Новые ключи: {r.newKeys.length}</div>
                  <div>
                    Изменённые: {r.changedKeys.length} · без изменений: {r.unchangedCount}
                  </div>
                  {r.errors?.length ? (
                    <ul className="mt-1 list-disc pl-4 text-danger">
                      {r.errors.slice(0, 20).map((e, i) => (
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
        </FadeIn>
      </div>
    </>
  );
}
