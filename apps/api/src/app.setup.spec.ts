import type { ErrorEvent } from '@sentry/nestjs';
import { scrubSentryEvent, shouldExposeApiDocs } from './app.setup';

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

describe('shouldExposeApiDocs (staff package T11: Swagger closed in production)', () => {
  it('production: closed, whatever else', () => {
    expect(shouldExposeApiDocs('production')).toBe(false);
    expect(shouldExposeApiDocs('production', undefined)).toBe(false);
    expect(shouldExposeApiDocs('production', '0')).toBe(false);
    expect(shouldExposeApiDocs('production', 'true')).toBe(false);
  });

  it('production: only the owner switch API_DOCS_IN_PRODUCTION=1 opens it', () => {
    expect(shouldExposeApiDocs('production', '1')).toBe(true);
  });

  it('development, test and staging keep the docs', () => {
    expect(shouldExposeApiDocs('development')).toBe(true);
    expect(shouldExposeApiDocs('test')).toBe(true);
    expect(shouldExposeApiDocs('staging')).toBe(true);
  });
});
