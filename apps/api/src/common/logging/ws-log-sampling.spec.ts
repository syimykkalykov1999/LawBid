import {
  WS_STORM_EVENTS_PER_MIN,
  WS_STORM_FULL_LOG_MS,
  WsStormDetector,
  wsLogDecision,
} from './ws-log-sampling';

const base = { samplePercent: 1, stormUntil: 0, now: 1_000, rand: 0.5 };

describe('wsLogDecision (S20-4)', () => {
  it('on: every event, weight 1', () => {
    expect(wsLogDecision({ ...base, mode: 'on' })).toEqual({
      log: true,
      weight: 1,
    });
  });
  it('auto and off: a 1 % sample, each line stands for 100 events', () => {
    expect(wsLogDecision({ ...base, mode: 'auto', rand: 0.5 })).toEqual({
      log: false,
      weight: 100,
    });
    expect(wsLogDecision({ ...base, mode: 'off', rand: 0.005 })).toEqual({
      log: true,
      weight: 100,
    });
  });
  it('auto during a spike: every event, weight 1; off ignores the spike', () => {
    const spike = { ...base, stormUntil: 5_000 };
    expect(wsLogDecision({ ...spike, mode: 'auto' })).toEqual({
      log: true,
      weight: 1,
    });
    expect(wsLogDecision({ ...spike, mode: 'off' }).log).toBe(false);
    expect(wsLogDecision({ ...spike, mode: 'auto', now: 6_000 }).log).toBe(
      false,
    );
  });
  it('the sample percent is kept inside 1..100', () => {
    expect(
      wsLogDecision({ ...base, mode: 'auto', samplePercent: 0 }).weight,
    ).toBe(100);
    expect(
      wsLogDecision({ ...base, mode: 'auto', samplePercent: 500, rand: 0.99 }),
    ).toEqual({ log: true, weight: 1 });
  });
});

describe('WsStormDetector', () => {
  it('stays quiet at a normal rate', () => {
    const d = new WsStormDetector();
    for (let i = 0; i < WS_STORM_EVENTS_PER_MIN; i += 1) {
      expect(d.record(60_000 * 10 + i)).toBe(false);
    }
  });
  it('flags a spike, keeps it for 30 minutes, then lets go', () => {
    const d = new WsStormDetector();
    const t = 60_000 * 10;
    let on = false;
    for (let i = 0; i <= WS_STORM_EVENTS_PER_MIN; i += 1) on = d.record(t + i);
    expect(on).toBe(true);
    expect(d.record(t + 20 * 60_000)).toBe(true);
    expect(d.record(t + WS_STORM_FULL_LOG_MS + 60_000)).toBe(false);
  });
  it('the count restarts every minute', () => {
    const d = new WsStormDetector();
    for (let m = 0; m < 5; m += 1) {
      for (let i = 0; i < WS_STORM_EVENTS_PER_MIN; i += 1) {
        d.record(60_000 * (10 + m) + i);
      }
    }
    expect(d.stormUntil).toBe(0);
  });
});
