import { describe, expect, it } from 'vitest';
import { actionHref, healthToItems, mergeSystemItems, sentryLine, type SentrySummary, type SystemItem } from './system-items';

const item = (code: string, severity: SystemItem['severity']): SystemItem => ({
  code,
  severity,
  title: code,
  why: 'why',
  action: { kind: 'route', target: '/x', label: 'Открыть' },
});

const health = (items: { key: string; status: string; detail?: Record<string, unknown> }[]) =>
  ({ items: items.map((i) => ({ ...i, detail: i.detail ?? {} })) }) as never;

describe('system items (owner «Система» block)', () => {
  it('turns the live core lights into rows; green, grey and non-core keys are ignored', () => {
    const rows = healthToItems(
      health([
        { key: 'queues', status: 'yellow', detail: { failed: 3, dlq: 1, oldestSec: 120 } },
        { key: 'database', status: 'red' },
        { key: 'redis', status: 'green' },
        { key: 'push', status: 'red' },
        { key: 'worker', status: 'grey' },
      ]),
    );
    expect(rows.map((r) => `${r.severity}:${r.code}`)).toEqual(['medium:live_queues', 'high:live_database']);
    expect(rows[0].why).toBe('упавших задач: 3, событий Stripe в отстойнике: 1, самая старая ждёт 2 мин. Откройте очереди на «Здоровье системы» и нажмите «Повторить».');
    expect(rows[1].title).toBe('Проблема: База данных');
    expect(healthToItems(undefined)).toEqual([]);
  });

  it('merges server and live rows by urgency, deduped by code', () => {
    const merged = mergeSystemItems(
      [item('cost_80', 'medium'), item('worker_down', 'critical'), item('live_queues', 'low')],
      health([{ key: 'queues', status: 'red' }, { key: 'database', status: 'yellow' }]),
    );
    expect(merged.map((m) => `${m.severity}:${m.code}`)).toEqual([
      'critical:worker_down',
      'medium:cost_80',
      'medium:live_database',
      'low:live_queues',
    ]);
  });

  it('action hrefs: route as is, guide → /guides/<id>, launch → the step redirect', () => {
    expect(actionHref({ kind: 'route', target: '/scale', label: '' })).toBe('/scale');
    expect(actionHref({ kind: 'guide', target: 'db-split', label: '' })).toBe('/guides/db-split');
    expect(actionHref({ kind: 'launch', target: 'r2_on', label: '' })).toBe('/guides?step=r2_on');
    expect(actionHref({ kind: 'url', target: 'https://sentry.io/x', label: '' })).toBe('https://sentry.io/x');
  });

  it('words the Sentry line for every state', () => {
    const base: SentrySummary = { state: 'ok', unresolved: 12, unresolvedAtLeast: false, newCount: 3, issues: [], url: 'https://s/x', error: null, computedAt: 'x' };
    expect(sentryLine(base)).toEqual({ text: 'Ошибки в приложении: 3 новых / 12 нерешённых', tone: 'danger', link: true });
    expect(sentryLine({ ...base, newCount: 0, unresolvedAtLeast: true })).toMatchObject({ text: 'Ошибки в приложении: 0 новых / 12+ нерешённых', tone: 'warning' });
    expect(sentryLine({ ...base, newCount: 0, unresolved: 0 }).tone).toBe('success');
    expect(sentryLine({ ...base, state: 'off' }).text).toContain('Сейчас выключено');
    expect(sentryLine({ ...base, state: 'unconfigured' }).text).toContain('Ключи и сервисы');
    expect(sentryLine({ ...base, state: 'error', error: 'HTTP 401' })).toMatchObject({ text: 'Sentry не ответил: HTTP 401. Следующая попытка через 5 минут.', tone: 'warning' });
    expect(sentryLine(undefined).link).toBe(false);
  });
});
