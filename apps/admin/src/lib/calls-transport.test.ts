import { describe, expect, it } from 'vitest';
import {
  carryingLine,
  checkLine,
  cloudflareStatus,
  isCallProvider,
  ownStatus,
  stateOfTransport,
  TRANSPORT_HINT,
  TRANSPORT_OF_STATE,
  type CallsPath,
} from './calls-transport';

const side = (over: Partial<CallsPath['cloudflare']> = {}): CallsPath['cloudflare'] => ({
  configured: true,
  parts: { turn: true, sfu: true },
  lastProbeAt: '2026-10-26T08:00:00.000Z',
  lastProbeOk: true,
  check: null,
  ...over,
});

const path = (over: Partial<CallsPath> = {}): CallsPath => ({
  transport: 'auto',
  carrying: 'cloudflare',
  breakers: { turn: 'closed', sfu: 'closed' },
  cloudflare: side(),
  own: side({ parts: { turn: true, livekit: false } }),
  ...over,
});

describe('«Связь для звонков»: the 3-state control', () => {
  it('Выкл / Вкл / Авто map to own / cloudflare / auto and back', () => {
    expect(TRANSPORT_OF_STATE).toEqual({ off: 'own', on: 'cloudflare', auto: 'auto' });
    expect(stateOfTransport('own')).toBe('off');
    expect(stateOfTransport('cloudflare')).toBe('on');
    expect(stateOfTransport('auto')).toBe('auto');
    // Unknown or missing reads as the default.
    expect(stateOfTransport(undefined)).toBe('auto');
    expect(stateOfTransport('weird')).toBe('auto');
  });

  it('the four call services go inside the card', () => {
    for (const id of ['cloudflare_turn', 'cloudflare_sfu', 'turn', 'livekit']) {
      expect(isCallProvider(id)).toBe(true);
    }
    expect(isCallProvider('stripe')).toBe(false);
  });
});

describe('«Связь для звонков»: the dots and the plain line', () => {
  it('healthy Cloudflare: Cloudflare green, own grey standby', () => {
    const r = path();
    expect(carryingLine(r)).toBe('Сейчас звонки идут через: Cloudflare');
    expect(cloudflareStatus(r).live).toBe('active');
    expect(ownStatus(r)).toMatchObject({ live: 'idle', state: 'auto' });
  });

  it('Cloudflare failing (breaker open): Cloudflare amber, own green, line says own', () => {
    const r = path({ carrying: 'own', breakers: { turn: 'open', sfu: 'closed' } });
    expect(carryingLine(r)).toBe('Сейчас звонки идут через: свою связь');
    expect(cloudflareStatus(r).live).toBe('attention');
    expect(cloudflareStatus(r).reason).toContain('вернётся сам');
    expect(ownStatus(r).live).toBe('active');
  });

  it('a failed «Проверить» on either side is amber (never blinking: a plain colour)', () => {
    expect(cloudflareStatus(path({ cloudflare: side({ lastProbeOk: false }) })).live).toBe('attention');
    expect(ownStatus(path({ own: side({ lastProbeOk: false }) })).live).toBe('attention');
  });

  it('Выкл: Cloudflare grey, own carries calls', () => {
    const r = path({ transport: 'own', carrying: 'own' });
    expect(cloudflareStatus(r)).toMatchObject({ live: 'idle', state: 'off' });
    expect(ownStatus(r).live).toBe('active');
  });

  it('no keys: grey with the reason, own not set up is grey too (quiet)', () => {
    const r = path({
      carrying: 'own',
      cloudflare: side({ configured: false, lastProbeAt: null, lastProbeOk: null }),
      own: side({ configured: false, lastProbeAt: null, lastProbeOk: null }),
    });
    expect(cloudflareStatus(r)).toMatchObject({ live: 'idle', reason: 'ключи Cloudflare не добавлены' });
    expect(ownStatus(r).live).toBe('idle');
  });

  it('the check line: ✓ with latency, ✗ with the reason, nothing before a check', () => {
    expect(checkLine(null)).toBeNull();
    expect(
      checkLine({ at: 'x', ok: true, ms: 84, stun: null, turn: null, media: null, error: null }),
    ).toBe('✓ 84 мс');
    expect(
      checkLine({
        at: 'x',
        ok: false,
        ms: 2000,
        stun: { ok: true, ms: 20 },
        turn: { ok: false, ms: 2000, error: 'TURN refused the login (401)' },
        media: null,
        error: null,
      }),
    ).toBe('✗ TURN refused the login (401)');
  });
});

/** TS-3 (audit 2026-10-26): the automatic backup is coturn + device to
 * device; LiveKit has no app client, so the card never promises it. */
describe('backup wording', () => {
  it('no hint promises LiveKit as the automatic backup', () => {
    for (const h of Object.values(TRANSPORT_HINT)) expect(h).not.toMatch(/LiveKit/);
  });
});
