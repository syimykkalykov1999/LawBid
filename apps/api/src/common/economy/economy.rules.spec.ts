import {
  affordableCeilings,
  allowedSpendUsd,
  dbMaxConnections,
  DB_TIERS,
  fargateTaskMonthUsd,
  limitStepUp,
  manualCeiling,
  nextGuardActive,
  nextTier,
  prevTier,
  shrinkBlocker,
  pressures,
  projectMonth,
  REDIS_TIERS,
} from './economy.rules';

describe('allowedSpendUsd', () => {
  it('takes the percent of revenue when it is above the threshold', () => {
    expect(allowedSpendUsd(1000, 50, 150)).toBe(500);
  });
  it('never goes below the threshold', () => {
    expect(allowedSpendUsd(100, 50, 150)).toBe(150);
    expect(allowedSpendUsd(0, 50, 150)).toBe(150);
  });
  it('ignores negative inputs', () => {
    expect(allowedSpendUsd(-500, 50, 150)).toBe(150);
    expect(allowedSpendUsd(1000, -5, 150)).toBe(150);
  });
});

describe('projectMonth', () => {
  it('extrapolates the month-to-date straight', () => {
    // Oct 10 of 31 days: 100 spent in 10 days → 310.
    expect(projectMonth(100, new Date('2026-10-10T12:00:00Z'))).toBeCloseTo(
      310,
    );
  });
  it('counts at least 3 days so day 1 does not explode', () => {
    expect(projectMonth(9, new Date('2026-10-01T01:00:00Z'))).toBeCloseTo(93);
  });
});

describe('nextGuardActive (hysteresis)', () => {
  it('switches on only above the allowed spend', () => {
    expect(nextGuardActive(false, 150, 150)).toBe(false);
    expect(nextGuardActive(false, 150.01, 150)).toBe(true);
  });
  it('stays on until the projection is under 90 % of the allowance', () => {
    expect(nextGuardActive(true, 140, 150)).toBe(true);
    expect(nextGuardActive(true, 135, 150)).toBe(false);
    expect(nextGuardActive(true, 100, 150)).toBe(false);
  });
});

describe('affordableCeilings', () => {
  const base = {
    apiRunning: 1,
    workerRunning: 1,
    apiTaskUsd: 18,
    workerTaskUsd: 28,
    minTasks: 1,
    apiHardCap: 50,
    workerHardCap: 20,
  };
  it('adds the tasks the spare money pays for', () => {
    // 180 spare: api 126 / 18 = 7 extra, worker 54 / 28 = 1 extra.
    expect(affordableCeilings({ ...base, headroomUsd: 180 })).toEqual({
      api: 8,
      worker: 2,
    });
  });
  it('stops at the Terraform cap however rich we are', () => {
    expect(affordableCeilings({ ...base, headroomUsd: 1_000_000 })).toEqual({
      api: 50,
      worker: 20,
    });
  });
  it('falls to the minimum when over the rule', () => {
    expect(
      affordableCeilings({ ...base, apiRunning: 6, headroomUsd: -1 }),
    ).toEqual({ api: 1, worker: 1 });
  });
  it('never goes below the tasks already needed at zero headroom', () => {
    expect(
      affordableCeilings({ ...base, apiRunning: 3, headroomUsd: 0 }).api,
    ).toBe(3);
  });
  it('respects a minimum above the cap', () => {
    expect(
      affordableCeilings({
        ...base,
        minTasks: 2,
        apiHardCap: 1,
        headroomUsd: 100,
      }).api,
    ).toBe(2);
  });
});

describe('limitStepUp', () => {
  it('lowers at once', () => expect(limitStepUp(20, 4)).toBe(4));
  it('raises gradually', () => expect(limitStepUp(4, 50)).toBe(9));
  it('takes the target when nothing was applied yet', () =>
    expect(limitStepUp(null, 50)).toBe(50));
  it('does not overshoot the target', () => expect(limitStepUp(4, 6)).toBe(6));
});

describe('manualCeiling', () => {
  it('clamps the owner value into [min, cap]', () => {
    expect(manualCeiling(100, 1, 50)).toBe(50);
    expect(manualCeiling(0, 1, 50)).toBe(1);
    expect(manualCeiling(7.9, 1, 50)).toBe(7);
  });
});

describe('fargateTaskMonthUsd', () => {
  it('prices 0.5 vCPU / 1 GB at about $18', () => {
    expect(fargateTaskMonthUsd(0.5, 1)).toBeCloseTo(18.0, 0);
  });
});

describe('tiers', () => {
  it('finds the next bigger database tier', () => {
    expect(nextTier(DB_TIERS, 'db.t4g.medium')?.name).toBe('db.t4g.large');
    expect(nextTier(DB_TIERS, 'db.t4g.large')?.name).toBe('db.r7g.large');
  });
  it('steps the Redis ladder the same way as the autoscaler', () => {
    expect(nextTier(REDIS_TIERS, 'cache.t4g.medium')?.name).toBe(
      'cache.r7g.large',
    );
    expect(nextTier(REDIS_TIERS, 'cache.r7g.2xlarge')).toBeNull();
    expect(nextTier(REDIS_TIERS, 'cache.m7g.large')).toBeNull();
  });
  it('has no next tier after the largest or for an unknown class', () => {
    expect(nextTier(DB_TIERS, 'db.r7g.2xlarge')).toBeNull();
    expect(nextTier(DB_TIERS, 'db.r6g.large')).toBeNull();
    expect(nextTier(REDIS_TIERS, null)).toBeNull();
  });
  it('computes RDS max connections from memory', () => {
    expect(dbMaxConnections(4)).toBe(450);
  });
});

describe('pressures', () => {
  it('flags only the limits that are crossed', () => {
    expect(
      pressures({
        dbCpuPercent: 71,
        dbConnections: 400,
        dbMaxConnections: 450,
        redisMemoryPercent: 74,
      }).map((p) => p.kind),
    ).toEqual(['db_cpu', 'db_connections']);
  });
  it('is empty at exactly the limits and with missing data', () => {
    expect(
      pressures({
        dbCpuPercent: 70,
        redisMemoryPercent: 75,
        dbConnections: 360,
        dbMaxConnections: 450,
      }),
    ).toEqual([]);
    expect(pressures({})).toEqual([]);
  });
});

describe('prevTier / shrinkBlocker', () => {
  const [micro, small] = DB_TIERS;
  const idle = { dbCpuPercent: 5, dbConnections: 10, redisMemoryPercent: 10 };

  it('finds the next smaller tier, none below the smallest', () => {
    expect(prevTier(DB_TIERS, 'db.t4g.medium')?.name).toBe('db.t4g.small');
    expect(prevTier(DB_TIERS, 'db.t4g.micro')).toBeNull();
    expect(prevTier(DB_TIERS, 'db.unknown')).toBeNull();
  });

  it('allows shrinking an idle database', () => {
    expect(shrinkBlocker('db', small, micro, idle)).toBeNull();
  });

  it('blocks on CPU, on connections of the smaller size, and on no data', () => {
    expect(
      shrinkBlocker('db', small, micro, { ...idle, dbCpuPercent: 45 }),
    ).toContain('Процессор');
    expect(
      shrinkBlocker('db', small, micro, { ...idle, dbConnections: 90 }),
    ).toContain('Соединений');
    expect(
      shrinkBlocker('db', small, micro, { ...idle, dbCpuPercent: null }),
    ).toContain('неизвестна');
  });

  it('Redis: scales the used memory to the smaller node', () => {
    const [r0, r1] = REDIS_TIERS;
    expect(shrinkBlocker('redis', r1, r0, idle)).toBeNull();
    expect(
      shrinkBlocker('redis', r1, r0, { ...idle, redisMemoryPercent: 30 }),
    ).toContain('Redis');
  });
});
