import { describe, expect, it } from 'vitest';
import { componentTitle, incidentSpan, word } from './system-health';

describe('status board wording', () => {
  it('words the new items', () => {
    const push = word({
      key: 'push',
      status: 'red',
      detail: { ok: 5, failed: 20, failedPct: 80, queueOldestSec: 3 },
    } as never);
    expect(push.title).toBe('Доставка пушей');
    expect(push.line).toContain('80 %');
    expect(push.todo).toBeTruthy();
    expect(word({ key: 'turn', status: 'grey', detail: {} } as never).line).toContain('не настроен');
    expect(word({ key: 'cloudflare_turn', status: 'red', detail: { error: 'HTTP 500' } } as never).todo).toBeTruthy();
    expect(componentTitle('cloudflare_sfu')).toContain('SFU');
    expect(componentTitle('r2')).toContain('R2');
    expect(componentTitle('stripe_webhooks')).toContain('Stripe');
    expect(componentTitle('http')).toContain('API');
    const ws = word({
      key: 'realtime',
      status: 'yellow',
      detail: { connects5m: 10, reconnects5m: 200, reconnectsPerMin: 40, authRefreshed5m: 3, authExpiringSent5m: 4 },
    } as never);
    expect(ws.title).toContain('соединение');
    expect(ws.line).toContain('200');
    expect(ws.todo).toBeTruthy();
  });

  it('admin switch audit 12.11: backup, second database and cost cards tell the current truth', () => {
    const backupGrey = word({ key: 'backup', status: 'grey', detail: {} } as never);
    expect(backupGrey.line).not.toContain('после запуска на AWS');
    expect(word({ key: 'backup', status: 'red', detail: { ageHours: 80, maxHours: 26 } } as never).todo).toContain('RDS');
    const shard = (shardsMode: string | undefined, extra: Record<string, unknown> = {}) =>
      word({ key: 'shard_growth', status: 'red', detail: { ratio: 1.1, shardsMode, ...extra } } as never).todo ?? '';
    expect(shard('auto')).toContain('создаст её сам');
    expect(shard('auto')).not.toContain('Terraform');
    expect(shard('off')).toContain('Выкл');
    expect(shard('on')).toContain('создаётся');
    const plan = { targetReady: true, plan: { shards: 64, rows: 1e6, estimatedSeconds: 120 } };
    expect(shard('auto', plan)).toContain('начнётся само');
    expect(shard('off', plan)).toContain('сам не запускается');
    expect(word({ key: 'cost', status: 'grey', detail: { configured: true } } as never).line).toContain('ещё не прислал');
    expect(word({ key: 'cost', status: 'grey', detail: { configured: false } } as never).line).toContain('после запуска на AWS');
  });

  it('e-mail card says SES sandbox plainly (08.11)', () => {
    const sandbox = word({
      key: 'email',
      status: 'red',
      detail: { problem: 'sandbox', text: 'SES: песочница — письма не уходят' },
    } as never);
    expect(sandbox.title).toContain('SES');
    expect(sandbox.line).toBe('SES: песочница — письма не уходят');
    expect(sandbox.todo).toContain('песочниц');
    expect(word({ key: 'email', status: 'green', detail: {} } as never).todo).toBeUndefined();
  });

  it('says how long an incident lasts', () => {
    const t0 = '2026-10-23T10:00:00Z';
    expect(incidentSpan(t0, '2026-10-23T10:12:00Z')).toBe('длился 12 мин');
    expect(incidentSpan(t0, null, Date.parse('2026-10-23T13:00:00Z'))).toBe('идёт 3 ч');
  });
});
