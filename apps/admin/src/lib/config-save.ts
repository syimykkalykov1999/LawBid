import type { QueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api/client';

/**
 * Owner list row 179 (detective R3A-6): every screen that saves one
 * app_config key or one switch sends the `updatedAt` this tab saw
 * (RFC 9110 §13.1.1 If-Match, the server answers 409 STALE_VERSION when
 * the row changed since). Before this only «Настройки» and «Функции» did;
 * the cards on Цены, Запись о сделке, ИИ-помощник, Причины, Автомодерация,
 * Лимиты текста, Рекомендации, Звонки, Перевод and Звёзды silently put an
 * old value back. The 409 carries the fresh row (`details.current`); it is
 * written into the cache at once, so the screen shows the winner's value
 * and the owner can save again on top of it.
 */
type ConfigRow = { key: string; value: unknown; stored?: boolean; updatedAt: string | null };
type FlagRow = { key: string; enabled: boolean; updatedAt: string };

/** `updatedAt` this tab saw for [key]; undefined = never loaded (no check). */
function seen<T extends { key: string; updatedAt: string | null }>(
  qc: QueryClient,
  queryKey: string,
  key: string,
): string | null | undefined {
  const row = qc.getQueryData<T[]>([queryKey])?.find((r) => r.key === key);
  return row ? row.updatedAt : undefined;
}

/** True when [e] is «changed by someone else» (409 STALE_VERSION). */
export function isStale(e: unknown): e is ApiError {
  return e instanceof ApiError && e.code === 'STALE_VERSION';
}

/** Writes the fresh row of a 409 STALE_VERSION into the cache. */
export function applyFreshRow(qc: QueryClient, e: unknown): void {
  if (!isStale(e)) return;
  const current = e.details?.current as (Partial<ConfigRow> & Partial<FlagRow>) | undefined;
  if (!current?.key) return;
  if ('enabled' in current) {
    qc.setQueryData<FlagRow[]>(['flags'], (rows) =>
      rows?.map((f) => (f.key === current.key ? { ...f, enabled: Boolean(current.enabled), updatedAt: String(current.updatedAt) } : f)),
    );
    return;
  }
  qc.setQueryData<ConfigRow[]>(['config'], (rows) =>
    rows?.map((r) =>
      r.key === current.key
        ? { ...r, value: current.value, stored: current.stored ?? r.stored, updatedAt: current.updatedAt ?? null }
        : r,
    ),
  );
}

/** PUT /admin/config/{key} with the version this tab saw. */
export async function saveConfig(qc: QueryClient, key: string, value: unknown) {
  const expected = seen<ConfigRow>(qc, 'config', key);
  try {
    const r = await api.PUT('/admin/config/{key}', {
      params: { path: { key } },
      // The contract types `value` as an opaque object; any JSON value is valid here.
      body: { value, ...(expected !== undefined ? { expectedUpdatedAt: expected } : {}) } as never,
    });
    const saved = r.data?.data;
    if (saved)
      qc.setQueryData<ConfigRow[]>(['config'], (rows) =>
        rows?.map((e) => (e.key === key ? { ...e, value: saved.value, stored: true, updatedAt: saved.updatedAt } : e)),
      );
    return r;
  } catch (e) {
    applyFreshRow(qc, e);
    throw e;
  }
}

/**
 * PATCH /admin/feature-flags/{key} with the version this tab saw.
 * `check: false` is the admin's own «Отменить» right after his save.
 */
export async function saveFlag(qc: QueryClient, key: string, enabled: boolean, opts: { check?: boolean } = {}) {
  const expected = opts.check === false ? undefined : seen<FlagRow>(qc, 'flags', key);
  try {
    const r = await api.PATCH('/admin/feature-flags/{key}', {
      params: { path: { key } },
      body: { enabled, ...(expected ? { expectedUpdatedAt: expected } : {}) },
    });
    const saved = r.data?.data;
    if (saved)
      qc.setQueryData<FlagRow[]>(['flags'], (rows) =>
        rows?.map((f) => (f.key === key ? { ...f, enabled: saved.enabled, updatedAt: saved.updatedAt } : f)),
      );
    return r;
  } catch (e) {
    applyFreshRow(qc, e);
    throw e;
  }
}
