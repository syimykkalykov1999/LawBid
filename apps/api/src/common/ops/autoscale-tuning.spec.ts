import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AUTOSCALE_TUNING_SCHEMA,
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
});
