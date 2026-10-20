import type { ErrorEvent } from '@sentry/browser';
import { describe, expect, it } from 'vitest';
import { maskText, scrubEvent } from './sentry';

describe('scrubEvent', () => {
  it('drops request data and the user, redacts PII keys, masks text', () => {
    const event = {
      type: undefined,
      request: { url: 'https://admin.lawbid.dev/people?phone=+1415', data: 'x', cookies: { a: 'b' } },
      user: { id: '7', email: 'a@b.co', ip_address: '1.1.1.1' },
      exception: { values: [{ value: 'failed for jane@firm.com +1 415 555 2680' }] },
      extra: { phone: '+1415', nested: { email: 'a@b.co', ok: 1 } },
    } as unknown as ErrorEvent;
    const out = scrubEvent(event);
    expect(out.request).toEqual({ url: 'https://admin.lawbid.dev/people' });
    expect(out.user).toEqual({ id: '7' });
    expect(out.exception?.values?.[0]?.value).toBe('failed for [email] [number]');
    expect(out.extra).toEqual({ phone: '[REDACTED]', nested: { email: '[REDACTED]', ok: 1 } });
  });

  it('masks numbers and e-mails', () => {
    expect(maskText('call +14155552680 now')).toBe('call [number] now');
  });
});
