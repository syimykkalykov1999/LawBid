import type { ErrorEvent } from '@sentry/nestjs';
import { scrubSentryEvent } from './app.setup';

describe('scrubSentryEvent (docs/06 §4.3)', () => {
  it('drops request bodies, headers, cookies, query and PII-named fields', () => {
    const event = scrubSentryEvent({
      request: {
        url: 'https://api.lawbid.app/api/v1/search/attorneys?q=secret',
        data: { phone: '+12025550101' },
        headers: { authorization: 'Bearer x' },
        cookies: { sid: '1' },
        query_string: 'q=secret',
      },
      user: { id: 'u1', email: 'a@b.c', ip_address: '1.2.3.4' },
      extra: { body: 'hello', nested: { email: 'a@b.c', ok: 1 } },
    } as unknown as ErrorEvent);
    expect(event.request).toEqual({
      url: 'https://api.lawbid.app/api/v1/search/attorneys',
    });
    expect(event.user).toEqual({ id: 'u1' });
    expect(event.extra).toEqual({
      body: '[REDACTED]',
      nested: { email: '[REDACTED]', ok: 1 },
    });
  });
});
