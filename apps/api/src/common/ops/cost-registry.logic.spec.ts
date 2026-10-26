import { COST_REGISTRY, entryById, type CostEntry } from './cost-registry';
import {
  SSM_MODE_BY_STATE,
  SSM_STATE_BY_MODE,
  attributeSpend,
  stateFromStored,
} from './cost-registry.logic';

const e = (id: string): CostEntry => {
  const x = entryById(id);
  if (!x) throw new Error(`no entry ${id}`);
  return x;
};

describe('stateFromStored', () => {
  it('maps a boolean setting to Выкл / Вкл and falls back to the built-in default', () => {
    const rek = e('vendor.rekognition');
    expect(stateFromStored(rek, false, true).state).toBe('off');
    expect(stateFromStored(rek, true, true).state).toBe('on');
    // No stored row: the default (true) decides.
    expect(stateFromStored(rek, undefined, true).state).toBe('on');
  });

  it('cost-guard cap: 0 = Выкл, no row = Авто, a hand-set number is flagged', () => {
    const sms = e('vendor.twilio');
    expect(stateFromStored(sms, 0, undefined)).toMatchObject({
      state: 'off',
      known: true,
    });
    expect(stateFromStored(sms, undefined, undefined)).toMatchObject({
      state: 'auto',
      known: true,
    });
    const hand = stateFromStored(sms, 400, undefined);
    expect(hand.known).toBe(false);
    expect(hand.state).toBe('auto');
    expect(hand.note).toContain('400');
  });

  it('three-state string setting', () => {
    const b = e('vendor.bunny');
    expect(stateFromStored(b, 'on', 'auto').state).toBe('on');
    expect(stateFromStored(b, 'off', 'auto').state).toBe('off');
    expect(stateFromStored(b, undefined, 'auto').state).toBe('auto');
  });
});

describe('SSM mode mapping', () => {
  it('round-trips Выкл / Вкл / Авто', () => {
    for (const st of ['off', 'on', 'auto'] as const) {
      expect(SSM_STATE_BY_MODE[SSM_MODE_BY_STATE[st]]).toBe(st);
    }
    expect(SSM_MODE_BY_STATE.auto).toBe('on'); // Авто keeps the Lambda working
  });
});

describe('attributeSpend', () => {
  const now = new Date('2026-10-15T12:00:00Z');

  it('a service owned by one row is real; a shared one is split by launch estimate', () => {
    const r = attributeSpend(
      COST_REGISTRY,
      [
        {
          service: 'Amazon Relational Database Service',
          gross: 30,
          credits: 0,
        },
        { service: 'Amazon Elastic Container Service', gross: 55, credits: 0 },
      ],
      1.5,
      [],
      now,
    );
    expect(r.byId['aws.rds']).toMatchObject({ monthUsd: 30, source: 'real' });
    expect(r.byId['aws.rds'].projectedUsd).toBe(45);
    const api = r.byId['aws.fargate_api'];
    const worker = r.byId['aws.fargate_worker'];
    const admin = r.byId['aws.fargate_admin'];
    expect(api.source).toBe('split');
    expect(
      (api.monthUsd ?? 0) + (worker.monthUsd ?? 0) + (admin.monthUsd ?? 0),
    ).toBeCloseTo(55, 1);
    // 18 : 28 : 9 of the launch estimate
    expect(worker.monthUsd).toBeGreaterThan(api.monthUsd ?? 0);
  });

  it('credits are not money out of the owner pocket', () => {
    const r = attributeSpend(
      COST_REGISTRY,
      [
        {
          service: 'Amazon Relational Database Service',
          gross: 30,
          credits: 30,
        },
      ],
      null,
      [],
      now,
    );
    expect(r.byId['aws.rds'].monthUsd).toBe(0);
  });

  it('a service on the bill that no row claims is reported, not dropped', () => {
    const r = attributeSpend(
      COST_REGISTRY,
      [{ service: 'Amazon Brand New Thing', gross: 12.345, credits: 0 }],
      null,
      [],
      now,
    );
    expect(r.unclaimed).toEqual([
      { service: 'Amazon Brand New Thing', usd: 12.35 },
    ]);
  });

  it('vendor rows read the vendor total or only their own lines', () => {
    const r = attributeSpend(
      COST_REGISTRY,
      null,
      null,
      [
        { id: 'twilio', monthToDateUsd: 7, forecastUsd: 14, lines: [] },
        {
          id: 'cloudflare',
          monthToDateUsd: 3,
          forecastUsd: 6,
          lines: [
            { label: 'Звонки: трафик сверх бесплатного', usd: 2 },
            { label: 'Фото и медиа (R2): хранение', usd: 1 },
          ],
        },
      ],
      now,
    );
    expect(r.byId['vendor.twilio']).toMatchObject({
      monthUsd: 7,
      projectedUsd: 14,
      source: 'real',
    });
    expect(r.byId['vendor.cloudflare_calls'].monthUsd).toBe(2);
    expect(r.byId['vendor.cloudflare_r2'].monthUsd).toBe(1);
  });

  it('rows with no bill to read stay empty', () => {
    const r = attributeSpend(COST_REGISTRY, null, null, [], now);
    expect(r.byId['aws.nat']).toEqual({
      monthUsd: null,
      projectedUsd: null,
      source: 'none',
    });
  });
});
