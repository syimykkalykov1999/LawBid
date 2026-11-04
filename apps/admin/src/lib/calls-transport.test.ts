import { describe, expect, it } from 'vitest';
import {
  carryingLine,
  checkLine,
  cloudflareStatus,
  isCallProvider,
  ownStatus,
  ownCostReminder,
  relayWarning,
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
  it('Выкл / Вкл / Авто map to calls.own_fallback and back', () => {
    expect(TRANSPORT_OF_STATE).toEqual({ off: 'off', on: 'manual-on', auto: 'auto' });
    expect(stateOfTransport('cloudflare')).toBe('off');
    expect(stateOfTransport('own')).toBe('on');
    expect(stateOfTransport('auto')).toBe('auto');
    // Unknown or missing reads as the default.
    expect(stateOfTransport(undefined)).toBe('off');
    expect(stateOfTransport('weird')).toBe('off');
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

  it('Вкл with a healthy Cloudflare: Cloudflare carries calls, the machine is idle for money', () => {
    const r = path({ transport: 'own' });
    expect(cloudflareStatus(r)).toMatchObject({ live: 'active', state: 'on' });
    expect(ownStatus(r)).toMatchObject({ live: 'idle', reason: 'работает впустую: звонки идут через Cloudflare' });
    expect(ownCostReminder(r)).toContain('впустую');
  });

  it('Вкл with Cloudflare down: the machine carries calls', () => {
    const r = path({ transport: 'own', carrying: 'own', breakers: { turn: 'open', sfu: 'closed' } });
    expect(ownStatus(r).live).toBe('active');
    expect(ownCostReminder(r)).toContain('несёт звонки');
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

describe('relayWarning (R-402)', () => {
  it('quiet when Cloudflare TURN is on', () => {
    expect(relayWarning(path())).toBeNull();
  });

  it('quiet when only our own coturn is there', () => {
    expect(
      relayWarning(path({ cloudflare: side({ configured: false, parts: { turn: false, sfu: false } }) })),
    ).toBeNull();
  });

  it('Cloudflare keys not switched on and no own coturn: tells the owner to press «Включить»', () => {
    const w = relayWarning(
      path({
        carrying: 'own',
        cloudflare: side({ configured: false, parts: { turn: false, sfu: false } }),
        own: side({ configured: false, parts: { turn: false, livekit: false } }),
      }),
    );
    expect(w).toContain('Включить');
    expect(w).toContain('TURN');
  });

  it('Выкл (Cloudflare only) and no keys: red, the call will not happen', () => {
    const w = relayWarning(
      path({
        transport: 'cloudflare',
        cloudflare: side({ configured: false, parts: { turn: false, sfu: false } }),
      }),
    );
    expect(w).toContain('не состоятся');
  });

  it('Выкл and Cloudflare failing: red even with a coturn set up, it will not start itself', () => {
    const w = relayWarning(path({ transport: 'cloudflare', cloudflare: side({ lastProbeOk: false }) }));
    expect(w).toContain('не запустится сама');
  });

  it('Вкл: no warning, a reminder that the machine costs money', () => {
    const r = path({ transport: 'own' });
    expect(relayWarning(r)).toBeNull();
    expect(ownCostReminder(r)).toContain('стоит денег');
    expect(ownCostReminder(path())).toBeNull();
  });

  it('Cloudflare on but failing its probe, no own coturn', () => {
    const w = relayWarning(
      path({
        cloudflare: side({ lastProbeOk: false }),
        own: side({ configured: false, parts: { turn: false, livekit: false } }),
      }),
    );
    expect(w).toContain('не отвечает');
  });
});
