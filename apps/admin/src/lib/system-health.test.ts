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
    expect(componentTitle('stripe_webhooks')).toContain('Stripe');
    expect(componentTitle('http')).toContain('API');
  });

  it('says how long an incident lasts', () => {
    const t0 = '2026-10-23T10:00:00Z';
    expect(incidentSpan(t0, '2026-10-23T10:12:00Z')).toBe('длился 12 мин');
    expect(incidentSpan(t0, null, Date.parse('2026-10-23T13:00:00Z'))).toBe('идёт 3 ч');
  });
});
