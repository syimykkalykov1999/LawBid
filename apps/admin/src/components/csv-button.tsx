'use client';

import { DownloadSimple } from '@phosphor-icons/react';
import { useState } from 'react';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useMe } from '@/lib/hooks';
import { can } from '@/lib/rbac';

/** Roles the server lets call `GET /admin/export/:entity`. */
/** Entities whose export carries personal contacts — the server wants X-Justification. */
const NEEDS_REASON = new Set(['users']);

function fileName(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      /* fall through */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() || fallback;
}

async function errorFrom(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
  if (res.status === 403) return 'Недостаточно прав для выгрузки.';
  return body?.error?.message ?? `Ошибка выгрузки (HTTP ${res.status})`;
}

/** Owner 14.11 (row 180): the page's filters as query parameters — only the
 * set ones (an empty string, false or undefined is «not filtered»). */
export function exportSearch(query: Record<string, string | boolean | undefined> | undefined): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === false || v === '') continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Downloads `/admin/export/<entity>` as a CSV file through the proxy
 * (which adds the admin session). Hidden for roles that can't export. */
export function CsvButton({
  entity,
  label = 'CSV',
  justification,
  query,
}: {
  entity: string;
  label?: string;
  /** The list's current filters (row 180): the file is what the list shows. */
  query?: Record<string, string | boolean | undefined>;
  /** Ask for a reason before downloading (default: on for 'users'). */
  justification?: boolean;
}) {
  const { data: me } = useMe();
  const toast = useToast();
  const { ask, dialog } = useReason();
  const [busy, setBusy] = useState(false);

  if (!me || !can(me, 'exports')) return null;

  const download = async () => {
    const headers: Record<string, string> = {};
    if (justification ?? NEEDS_REASON.has(entity)) {
      const r = await ask({
        title: 'Причина выгрузки',
        description: 'В файле есть контакты пользователей. Причина записывается в журнал аудита.',
        label: 'Причина',
        required: true,
        confirm: 'Скачать',
      });
      if (!r) return;
      headers['X-Justification'] = encodeURIComponent(r.text);
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/proxy/export/${encodeURIComponent(entity)}${exportSearch(query)}`, {
        headers,
        credentials: 'same-origin',
      });
      if (!res.ok) {
        toast.error(await errorFrom(res));
        return;
      }
      const blob = await res.blob();
      const name = fileName(res.headers.get('content-disposition'), `${entity}.csv`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      // S18-3: the server ends a cut-off file with a «ОБРЕЗАНА» line.
      const tail = await blob.slice(-400).text();
      if (tail.includes('ВЫГРУЗКА ОБРЕЗАНА')) {
        toast.info(`Файл ${name} скачан, но он неполный: в таблице больше 50 000 строк, в файле первые 50 000.`);
      } else {
        toast.success(`Файл ${name} скачан`);
      }
    } catch {
      toast.error('Не удалось скачать файл. Проверьте соединение.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {dialog}
      <Button variant="outline" loading={busy} onClick={() => void download()}>
        <DownloadSimple size={16} weight="light" />
        {label}
      </Button>
    </>
  );
}
