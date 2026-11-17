import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AUTOSCALE_TUNING_SCHEMA,
  ECS_CAPACITY_KINDS,
  checkEcsCapacity,
  splitKinds,
  spotSplit,
  validateAutoscaleTuning,
} from './autoscale-tuning';

/**
 * Owner 14.11: every «Авто» number of the Redis / database autoscalers is
 * changeable from the admin (SSM `<prefix>/tuning`, read by the Lambda on
 * every run). The admin's table must be the Lambda's own schema.
 */
const lambdaSchema = (m: string) =>
  JSON.parse(
    readFileSync(
      join(
        __dirname,
        `../../../../../infra/modules/${m}/lambda/tuning_schema.json`,
      ),
      'utf8',
    ),
  ) as unknown;

describe('autoscale tuning (admin → SSM → Lambda)', () => {
  it('the admin table equals the Lambdas’ tuning_schema.json', () => {
    expect(AUTOSCALE_TUNING_SCHEMA.redis).toEqual(
      lambdaSchema('redis-autoscale'),
    );
    expect(AUTOSCALE_TUNING_SCHEMA.db).toEqual(lambdaSchema('db-autoscale'));
    expect(AUTOSCALE_TUNING_SCHEMA.endpoints).toEqual(
      lambdaSchema('endpoints-autoscale'),
    );
    expect(AUTOSCALE_TUNING_SCHEMA.spot).toEqual(lambdaSchema('spot-fallback'));
  });

  it('ECS CPU targets go below 1 % (a live test on an idle service: admin ~1 %, pooler ~0.7 % CPU on 15.11)', () => {
    for (const p of [
      'api_cpu',
      'worker_cpu',
      'admin_cpu',
      'api_admin_cpu',
      'pgbouncer_cpu',
    ]) {
      expect(validateAutoscaleTuning('ecs', { [`${p}.target`]: 0.3 })).toEqual({
        ok: true,
        values: { [`${p}.target`]: 0.3 },
      });
    }
    expect(validateAutoscaleTuning('ecs', { 'api_cpu.target': 0 })).toEqual({
      ok: false,
      errors: ['api_cpu.target: 0.1–100'],
    });
  });

  it('spot fallback: the quiet hold from the admin', () => {
    expect(validateAutoscaleTuning('spot', { restore_after_min: 2 })).toEqual({
      ok: true,
      values: { restore_after_min: 2 },
    });
    expect(validateAutoscaleTuning('spot', { restore_after_min: 0 })).toEqual({
      ok: false,
      errors: ['restore_after_min: 1–1000000000'],
    });
  });

  it('keeps valid numbers, refuses unknown keys and values outside the bounds', () => {
    expect(
      validateAutoscaleTuning('redis', { down_window_h: 2, night_start_h: 19 }),
    ).toEqual({ ok: true, values: { down_window_h: 2, night_start_h: 19 } });
    expect(validateAutoscaleTuning('redis', { up_cpu_pct: 0 })).toEqual({
      ok: false,
      errors: ['up_cpu_pct: 1–100'],
    });
    expect(validateAutoscaleTuning('db', { period_s: 60 })).toEqual({
      ok: false,
      errors: ['period_s: unknown'],
    });
    expect(validateAutoscaleTuning('db', { single_node_up: 0.5 })).toEqual({
      ok: false,
      errors: ['single_node_up: 0 or 1'],
    });
  });

  it('null removes a key (back to the Terraform default)', () => {
    expect(validateAutoscaleTuning('db', { down_window_h: null })).toEqual({
      ok: true,
      values: {},
    });
  });

  it('ECS: every policy has a target and both pauses', () => {
    const keys = Object.keys(AUTOSCALE_TUNING_SCHEMA.ecs);
    for (const p of [
      'api_cpu',
      'worker_cpu',
      'api_requests',
      'api_sockets',
      'worker_queue',
      'admin_cpu',
      'api_admin_cpu',
      'pgbouncer_cpu',
    ]) {
      for (const f of ['target', 'in_s', 'out_s'])
        expect(keys).toContain(`${p}.${f}`);
    }
    expect(validateAutoscaleTuning('ecs', { 'api_cpu.target': 101 })).toEqual({
      ok: false,
      errors: ['api_cpu.target: 0.1–100'],
    });
  });

  it('owner 15.11: floor and Spot split of every service, AWS bounds, floor at least 1', () => {
    const keys = Object.keys(AUTOSCALE_TUNING_SCHEMA.ecs);
    for (const k of ECS_CAPACITY_KINDS) {
      for (const f of [
        'min_tasks',
        'spot_base',
        'fargate_weight',
        'spot_weight',
      ])
        expect(keys).toContain(`${k}.${f}`);
    }
    expect(
      validateAutoscaleTuning('ecs', { 'pgbouncer.min_tasks': 0 }),
    ).toEqual({
      ok: false,
      errors: ['pgbouncer.min_tasks: 1–1000000000'],
    });
    expect(validateAutoscaleTuning('ecs', { 'api.spot_weight': 1001 })).toEqual(
      {
        ok: false,
        errors: ['api.spot_weight: 0–1000'],
      },
    );
    expect(validateAutoscaleTuning('ecs', { 'api.spot_base': 100001 })).toEqual(
      {
        ok: false,
        errors: ['api.spot_base: 0–100000'],
      },
    );
  });

  it('owner 15.11: cross checks — floor not above the ceiling, one weight above 0', () => {
    expect(checkEcsCapacity({ 'api.min_tasks': 3 }, { api: 3 })).toEqual([]);
    expect(checkEcsCapacity({ 'api.min_tasks': 4 }, { api: 3 })).toEqual([
      'api.min_tasks: не больше максимума 3',
    ]);
    expect(checkEcsCapacity({ 'worker.spot_weight': 0 }, {})).toEqual([]);
    expect(
      checkEcsCapacity(
        { 'worker.spot_weight': 0, 'worker.fargate_weight': 0 },
        {},
      ),
    ).toEqual(['worker.spot_weight: обе доли 0']);
    expect(spotSplit({ 'admin.spot_weight': 2 }, 'admin')).toEqual({
      base: 1,
      fargate: 1,
      spot: 2,
    });
    expect(splitKinds({ 'admin.spot_weight': 2, 'api.min_tasks': 2 })).toEqual([
      'admin',
    ]);
  });
});
