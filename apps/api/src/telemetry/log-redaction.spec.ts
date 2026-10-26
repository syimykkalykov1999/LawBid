import pino from 'pino';
import { Writable } from 'node:stream';
import { pinoHttpOptions } from '../app.module';
import { scrubLogObject } from './scrub';

function logger() {
  const lines: Record<string, unknown>[] = [];
  const sink = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      cb();
    },
  });
  const log = pino(
    {
      redact: pinoHttpOptions.redact,
      formatters: pinoHttpOptions.formatters,
    },
    sink,
  );
  return { log, lines };
}

describe('log redaction (S3-12)', () => {
  it('removes headers and keys of a provider SDK error', () => {
    const { log, lines } = logger();
    const err = Object.assign(new Error('Request failed with status 401'), {
      config: {
        headers: { Authorization: 'Basic c2VjcmV0', 'X-Api-Key': 'sk_live_1' },
        data: '{"password":"hunter2"}',
      },
      response: {
        config: { headers: { authorization: 'Bearer abc' }, url: 'https://x' },
      },
    });
    log.error({ err }, 'twilio failed');
    const out = JSON.stringify(lines[0]);
    expect(out).not.toContain('c2VjcmV0');
    expect(out).not.toContain('sk_live_1');
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('Bearer abc');
  });

  it('redacts a nested authorization / apiKey / token at any first level', () => {
    const { log, lines } = logger();
    log.info(
      {
        provider: {
          authorization: 'Bearer zzz',
          apiKey: 'k-123',
          token: 't-1',
        },
        ok: 'visible',
      },
      'call',
    );
    const out = JSON.stringify(lines[0]);
    expect(out).not.toContain('zzz');
    expect(out).not.toContain('k-123');
    expect(out).not.toContain('t-1');
    expect(out).toContain('visible');
  });

  it('cleans client data out of the error text', () => {
    const e = new Error(
      'send failed for anna@example.com\ncall +1 415 555 0100\nfile Divorce_Ivanov.pdf',
    );
    const out = scrubLogObject({ err: { message: e.message, stack: e.stack } });
    const err = out.err as { message: string; stack: string };
    expect(err.message).toContain('[email]');
    expect(err.message).toContain('[phone]');
    expect(err.message).toContain('[file]');
    expect(err.message).not.toContain('anna@example.com');
    expect(err.stack).not.toContain('Ivanov');
  });

  it('leaves lines without an error untouched', () => {
    const o = { msg: 'hello', n: 1 };
    expect(scrubLogObject(o)).toBe(o);
  });
});
