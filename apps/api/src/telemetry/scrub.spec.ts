import type { ErrorEvent } from '@sentry/nestjs';
import { scrubSentryEvent } from '../app.setup';
import { SCRUB_MAX_CHARS, scrubDeep, scrubString } from './scrub';

describe('scrubString (ABA 1.6(c): client information stays out of reports)', () => {
  it('removes e-mails and phone numbers', () => {
    const out = scrubString(
      'failed for jane.doe@client-mail.com / +1 (202) 555-0101 and 2025550102',
    );
    expect(out).not.toContain('jane.doe');
    expect(out).not.toContain('555');
    expect(out).not.toContain('2025550102');
    expect(out).toContain('[email]');
    expect(out).toContain('[phone]');
  });

  it('removes document names', () => {
    const out = scrubString(
      'ENOENT cases/ab/Settlement offer - Smith v. Jones (final).pdf and scan_0042.JPEG',
    );
    expect(out).not.toMatch(/Settlement|Smith|scan_0042/);
    expect(out).toContain('[file]');
  });

  it('removes the query string of a signed link', () => {
    const out = scrubString(
      'GET https://d1.cloudfront.net/case/x?Expires=1&Signature=abc&Key-Pair-Id=K1 failed',
    );
    expect(out).toContain('https://d1.cloudfront.net/case/x?[REDACTED]');
    expect(out).not.toContain('Signature=abc');
    const bare = scrubString('X-Amz-Signature=deadbeef&X-Amz-Date=2026');
    expect(bare).not.toContain('deadbeef');
  });

  it('cuts long text', () => {
    expect(scrubString('a'.repeat(5000)).length).toBeLessThanOrEqual(
      SCRUB_MAX_CHARS + 1,
    );
  });

  it('leaves ordinary diagnostics readable', () => {
    expect(scrubString('Redis connection lost, retry 3 of 5')).toBe(
      'Redis connection lost, retry 3 of 5',
    );
  });
});

describe('scrubDeep', () => {
  it('redacts sensitive keys and cleans nested strings', () => {
    const o = scrubDeep({
      fileName: 'will.docx',
      text: 'my client said',
      nested: [{ note: 'x', url: 'https://a.b/c?Signature=1', n: 3 }],
    }) as Record<string, unknown>;
    expect(o.fileName).toBe('[REDACTED]');
    expect(o.text).toBe('[REDACTED]');
    expect(o.nested).toEqual([
      { note: '[REDACTED]', url: 'https://a.b/c?[REDACTED]', n: 3 },
    ]);
  });
});

describe('scrubSentryEvent keeps client data out of the event', () => {
  it('cleans the message, exception texts and breadcrumbs', () => {
    const event = scrubSentryEvent({
      message: 'upload of Retainer agreement.pdf by +12025550101 failed',
      exception: {
        values: [
          {
            type: 'PrismaClientKnownRequestError',
            value: 'Unique constraint on body: "call me at x@y.com"',
          },
        ],
      },
      breadcrumbs: [
        {
          category: 'http',
          message: 'GET https://cdn.example.com/f/1?Signature=zzz',
          data: { url: 'https://cdn.example.com/f/1?Signature=zzz' },
        },
        { category: 'chat', data: { text: 'privileged advice' } },
      ],
    } as unknown as ErrorEvent);
    expect(JSON.stringify(event)).not.toMatch(
      /Retainer|2025550101|x@y\.com|Signature=zzz|privileged/,
    );
  });
});
