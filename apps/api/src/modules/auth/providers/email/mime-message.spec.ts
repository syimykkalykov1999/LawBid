import {
  base64Lines,
  buildMimeMessage,
  encodeHeaderText,
  sanitizeHeaderValue,
} from './mime-message';

describe('email: raw MIME builder (SES SendRawEmail)', () => {
  const fixed = { date: new Date('2026-10-05T12:00:00Z'), boundary: 'B1' };

  it('builds multipart/alternative with base64 UTF-8 parts and custom headers', () => {
    const raw = buildMimeMessage({
      from: 'LawBid <no-reply@lawbid.dev>',
      to: 'lead@example.com',
      subject: 'Hello Ivan',
      text: 'Привет, Иван!\nUnsubscribe: https://x/u/t',
      html: '<p>Привет</p>',
      headers: {
        'List-Unsubscribe':
          '<https://api.lawbid.dev/api/v1/outreach/unsubscribe/t>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      ...fixed,
    });
    const lines = raw.split('\r\n');
    expect(lines[0]).toBe('From: LawBid <no-reply@lawbid.dev>');
    expect(lines[1]).toBe('To: lead@example.com');
    expect(lines[2]).toBe('Subject: Hello Ivan');
    expect(lines[3]).toBe('Date: Mon, 05 Oct 2026 12:00:00 GMT');
    expect(lines).toContain(
      'List-Unsubscribe: <https://api.lawbid.dev/api/v1/outreach/unsubscribe/t>',
    );
    expect(lines).toContain(
      'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
    );
    expect(lines).toContain(
      'Content-Type: multipart/alternative; boundary="B1"',
    );
    expect(raw).toContain(
      '--B1\r\nContent-Type: text/plain; charset=UTF-8\r\n',
    );
    expect(raw).toContain('--B1\r\nContent-Type: text/html; charset=UTF-8\r\n');
    expect(raw.endsWith('--B1--\r\n')).toBe(true);
    // The text body round-trips through base64.
    const textB64 = raw
      .split('Content-Transfer-Encoding: base64\r\n\r\n')[1]
      .split('\r\n--B1')[0]
      .replace(/\r\n/g, '');
    expect(Buffer.from(textB64, 'base64').toString('utf8')).toBe(
      'Привет, Иван!\nUnsubscribe: https://x/u/t',
    );
    // No raw non-ASCII in the message.
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7f]/.test(raw)).toBe(false);
  });

  it('is a plain text/plain message without html', () => {
    const raw = buildMimeMessage({
      from: 'a@b.co',
      to: 'c@d.co',
      subject: 'x',
      text: 'hi',
      ...fixed,
    });
    expect(raw).toContain(
      'MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n',
    );
    expect(raw).not.toContain('multipart');
  });

  it('encodes a non-ASCII subject and strips header injection', () => {
    expect(encodeHeaderText('Привет')).toBe('=?UTF-8?B?0J/RgNC40LLQtdGC?=');
    expect(sanitizeHeaderValue('a\r\nBcc: evil@x.co')).toBe('a Bcc: evil@x.co');
    const raw = buildMimeMessage({
      from: 'a@b.co',
      to: 'c@d.co',
      subject: 'x',
      text: 'hi',
      headers: {
        'X-Ok': 'v\r\nInjected: yes',
        'Bad Name': 'v',
        From: 'spoof@x.co',
      },
      ...fixed,
    });
    expect(raw).toContain('X-Ok: v Injected: yes\r\n');
    expect(raw).not.toContain('Bad Name');
    expect(raw).not.toContain('spoof@x.co');
    expect(raw.match(/^From: /gm)).toHaveLength(1);
  });

  it('wraps base64 at 76 columns', () => {
    const lines = base64Lines('x'.repeat(200)).split('\r\n');
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(76);
    expect(lines.length).toBeGreaterThan(1);
  });
});
