import type { ErrorEvent } from '@sentry/browser';
import * as Sentry from '@sentry/browser';
import { describe, expect, it } from 'vitest';
import { maskText, scrubEvent, sentryInitOptions } from './sentry';

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

describe('sentryInitOptions (Sentry 11)', () => {
  // MIGRATION.md 10→11: `sendDefaultPii` was removed and an unset
  // `dataCollection` now collects cookies, bodies, headers and the user.
  it('keeps the v10 restrictive baseline and no removed options', () => {
    const deny = ['forwarded', '-ip', 'remote-', 'via', '-user'];
    const opts = sentryInitOptions('https://k@o1.ingest.sentry.io/1');
    expect(opts).not.toHaveProperty('sendDefaultPii');
    expect(opts.dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { deny }, response: { deny } },
      httpBodies: [],
      urlQueryParams: { deny },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
    });
    expect(opts).toMatchObject({
      environment: 'production',
      tracesSampleRate: 0,
      // v11 turned this on by default; v10 sent no synthetic stacks.
      attachStacktrace: false,
    });
  });

  // v11 changed the default session lifecycle from «route» to «page». The
  // panel sets no `release`, and the SDK discards every session without one
  // («Discarded session because of missing or non-string release»), so no
  // session leaves the browser in v10 or v11 and the change does not apply.
  // Setting a release later means choosing the lifecycle on purpose.
  it('sends no sessions (no release), before and after navigation', async () => {
    const sent: string[] = [];
    const transport = () => ({
      send: async (envelope: unknown) => {
        sent.push(JSON.stringify(envelope));
        return {};
      },
      flush: async () => true,
    });
    Sentry.init({
      ...sentryInitOptions('https://k@o1.ingest.sentry.io/1'),
      transport,
    });
    window.history.pushState({}, '', '/people');
    window.history.pushState({}, '', '/cases');
    Sentry.captureException(new Error('boom'));
    await Sentry.close(200);
    expect(sent.some((e) => e.includes('"type":"event"'))).toBe(true);
    expect(sent.filter((e) => e.includes('"type":"session"'))).toEqual([]);
  });

  it('scrubs every event in beforeSend', () => {
    const opts = sentryInitOptions('https://k@o1.ingest.sentry.io/1');
    const event = {
      type: undefined,
      user: { id: '7', email: 'a@b.co' },
    } as unknown as ErrorEvent;
    const out = opts.beforeSend?.(event, {}) as ErrorEvent;
    expect(out.user).toEqual({ id: '7' });
  });
});
