'use client';

import { DownloadSimple } from '@phosphor-icons/react';
import { useState } from 'react';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useMe } from '@/lib/hooks';
import type { AdminRole } from '@/lib/rbac';

/** Roles the server lets call `GET /admin/export/:entity`. */
const EXPORT_ROLES: readonly AdminRole[] = ['super_admin', 'finance', 'support'];
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

/** Downloads `/admin/export/<entity>` as a CSV file through the proxy
 * (which adds the admin session). Hidden for roles that can't export. */
export function CsvButton({
  entity,
  label = 'CSV',
  justification,
}: {
  entity: string;
  label?: string;
  /** Ask for a reason before downloading (default: on for 'users'). */
  justification?: boolean;
}) {
  const { data: me } = useMe();
  const toast = useToast();
  const { ask, dialog } = useReason();
  const [busy, setBusy] = useState(false);

  if (!me || !EXPORT_ROLES.includes(me.role)) return null;

  const download = async () => {
    const headers: Record<string, string> = {};
    if (justification ?? NEEDS_REASON.has(entity)) {
      const r = await ask({
        title: 'Причина выгрузки',
        description: 'В файле есть контакты пользователей. Причина записывается в журнал аудита.',
        label: 'Причина',
        confirm: 'Скачать',
      });
      if (!r) return;
      headers['X-Justification'] = encodeURIComponent(r.text);
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/proxy/export/${encodeURIComponent(entity)}`, {
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
      toast.success(`Файл ${name} скачан`);
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
