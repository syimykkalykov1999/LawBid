import { cleanText, hasPii, hashRef, scrubPii } from './staff-ai-pii';

describe('staff AI PII scrubber', () => {
  it('removes e-mails, phones, card and SSN-like numbers, document ids', () => {
    const text =
      'Write to jane.doe+x@mail.co.uk or call +1 (218) 551-6788 / 8 916 123 45 67. ' +
      'Card 4111 1111 1111 1111, SSN 123-45-6789, passport AB1234567, N12345678.';
    const out = scrubPii(text);
    expect(out).not.toMatch(/@/);
    expect(out).not.toMatch(/551-6788/);
    expect(out).not.toMatch(/4111/);
    expect(out).not.toMatch(/123-45-6789/);
    expect(out).not.toMatch(/AB1234567|N12345678/);
    expect(out).toContain('[email]');
    expect(out).toContain('[phone]');
    expect(out).toContain('[number]');
    expect(out).toContain('[id]');
    expect(hasPii(out)).toBe(false);
  });

  it('keeps plain facts: short numbers, ISO dates, normal words', () => {
    const text =
      'Ticket opened 2026-10-27 12:30, 3 replies, priority 2, refund of 49 USD.';
    expect(scrubPii(text)).toBe(text);
  });

  it('strips URL query strings, IP addresses and key-like tokens', () => {
    const out = scrubPii(
      'see https://x.example/a/b?token=abc123&u=1 from 203.0.113.9 with sk-ant-api03-abcdefghijklmnopqrstuv',
    );
    expect(out).toContain('https://x.example/a/b');
    expect(out).not.toContain('token=');
    expect(out).toContain('[ip]');
    expect(out).toContain('[secret]');
  });

  it('cleanText cuts, flattens whitespace and scrubs', () => {
    expect(cleanText(null, 10)).toBe('');
    const out = cleanText('a@b.co\n\n  hello   world '.repeat(30), 60);
    expect(out.length).toBeLessThanOrEqual(61);
    expect(out).not.toMatch(/@/);
    expect(out).not.toMatch(/\n/);
  });

  it('hashRef is stable, short and does not contain the id', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    expect(hashRef(id)).toBe(hashRef(id));
    expect(hashRef(id)).toMatch(/^[0-9a-f]{12}$/);
    expect(hashRef(id)).not.toBe(
      hashRef('223e4567-e89b-12d3-a456-426614174000'),
    );
  });
});
