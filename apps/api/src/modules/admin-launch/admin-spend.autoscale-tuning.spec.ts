import { AdminSpendController } from './admin-spend.controller';

/**
 * Owner 14.11: «Авто» numbers from the admin. Owner only (the controller is
 * super_admin), a fresh 2FA code, validated against the Lambda's schema,
 * merged into SSM `<prefix>/tuning`, audited with before / after.
 */
function build(stored: Record<string, number> = { down_window_h: 2 }) {
  const ssm = {
    tuningParam: jest.fn((t: string) =>
      t === 'redis' || t === 'ecs' ? `/x/${t}/tuning` : undefined,
    ),
    getTuning: jest.fn((t: string) =>
      Promise.resolve(t === 'redis' ? { ...stored } : t === 'ecs' ? {} : null),
    ),
    setTuning: jest.fn(() => Promise.resolve()),
  };
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const auth = { assertStepUp: jest.fn(() => Promise.resolve()) };
  const awsOps = {
    applyScaling: jest.fn(() =>
      Promise.resolve({ changed: ['api_cpu'], missing: [] }),
    ),
  };
  const c = new AdminSpendController(
    {} as never,
    {} as never,
    audit as never,
    auth as never,
    {} as never,
    ssm as never,
    awsOps as never,
  );
  return { c, ssm, audit, auth, awsOps };
}
const owner = { id: 'o1', sessionId: 's1', ip: '1.1.1.1' } as never;

describe('admin «Авто» numbers (SSM tuning)', () => {
  it('lists every knob with its label, bounds and the admin value', async () => {
    const { c } = build();
    const r = await c.autoscaleTuning();
    const redis = r.targets.find((t) => t.target === 'redis')!;
    expect(redis.available).toBe(true);
    expect(redis.knobs.find((k) => k.key === 'down_window_h')).toMatchObject({
      value: 2,
      min: 0,
      max: 1000000000,
    });
    expect(
      redis.knobs.find((k) => k.key === 'night_start_h')?.value,
    ).toBeNull();
    expect(r.targets.find((t) => t.target === 'db')!.available).toBe(false);
  });

  it('saves with 2FA, merges, null drops a key, audits before / after', async () => {
    const { c, ssm, audit, auth } = build();
    await c.updateAutoscaleTuning(owner, 'redis', {
      values: { night_start_h: 19, down_window_h: null },
    });
    expect(auth.assertStepUp).toHaveBeenCalledWith('s1');
    expect(ssm.setTuning).toHaveBeenCalledWith('redis', { night_start_h: 19 });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ops.autoscale_tuning',
        before: { target: 'redis', values: { down_window_h: 2 } },
        after: { target: 'redis', values: { night_start_h: 19 } },
      }),
    );
  });

  it('refuses a value outside the bounds (400) and an autoscaler that is not there (409)', async () => {
    const { c, ssm } = build();
    await expect(
      c.updateAutoscaleTuning(owner, 'redis', { values: { up_cpu_pct: 0 } }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      c.updateAutoscaleTuning(owner, 'db', { values: { up_cpu_pct: 50 } }),
    ).rejects.toMatchObject({ status: 409 });
    expect(ssm.setTuning).not.toHaveBeenCalled();
  });

  it('ECS numbers are applied at once (PutScalingPolicy) and the result is audited', async () => {
    const { c, ssm, audit, awsOps } = build();
    await c.updateAutoscaleTuning(owner, 'ecs', {
      values: { 'api_cpu.target': 45 },
    });
    expect(ssm.setTuning).toHaveBeenCalledWith('ecs', { 'api_cpu.target': 45 });
    expect(awsOps.applyScaling).toHaveBeenCalledWith({ 'api_cpu.target': 45 });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        after: {
          target: 'ecs',
          values: { 'api_cpu.target': 45 },
          applied: { changed: ['api_cpu'], missing: [] },
        },
      }),
    );
  });
});
