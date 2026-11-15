import {
  autoApplyBlockers,
  autoWants,
  type AutoSignals,
} from './infra-auto.logic';

/**
 * Owner 15.11, verbatim: «разреши "Авто" само применять обновления кода своих
 * функций без меня». The item `aws.autoscale_code` applies the merged code of
 * the four autoscale Lambdas by itself — only when the plan holds nothing but
 * their in-place updates (plus the alarm / invoke-config roll-through of
 * today). Anything else waits for the owner.
 */
const S = 'module.stack.module';
const fn = (m: string, action = 'update') => ({
  address: `${S}.${m}[0].aws_lambda_function.this`,
  action,
});
const applied = {
  address: 'module.stack.aws_ssm_parameter.autoscale_code_applied',
  action: 'update',
};

describe('aws.autoscale_code: «Авто» applies its own functions’ code', () => {
  it('only the four functions updated in place (+ the applied marker) → applies by itself', () => {
    for (const to of ['on', 'off'] as const) {
      expect(
        autoApplyBlockers(
          to,
          [
            fn('redis_autoscale'),
            fn('db_autoscale'),
            fn('endpoints_autoscale'),
            fn('spot_fallback'),
            applied,
          ],
          'aws.autoscale_code',
        ),
      ).toEqual([]);
    }
  });

  it('a function created or replaced, an IAM change, a CloudFront change or a delete → waits for the owner', () => {
    const blocked = (r: { address: string; action: string }) =>
      autoApplyBlockers('on', [fn('redis_autoscale'), r], 'aws.autoscale_code');
    expect(blocked(fn('db_autoscale', 'create'))).toHaveLength(1);
    expect(blocked(fn('db_autoscale', 'delete,create'))).toHaveLength(1);
    expect(
      blocked({
        address: `${S}.redis_autoscale[0].aws_iam_role.lambda`,
        action: 'update',
      }),
    ).toHaveLength(1);
    expect(
      blocked({
        address: `${S}.web.aws_cloudfront_distribution.web`,
        action: 'update',
      }),
    ).toHaveLength(1);
    expect(
      blocked({
        address: `${S}.growth.aws_opensearch_domain.search[0]`,
        action: 'delete',
      }),
    ).toHaveLength(1);
    // another Lambda (not one of the four) is not this item's
    expect(
      blocked({
        address: `${S}.secret_rotation[0].aws_lambda_function.this`,
        action: 'create',
      }),
    ).toHaveLength(1);
  });

  it('«Авто» asks for it when main carries code the functions do not run yet', () => {
    const base = {
      pressures: [],
      budgetRatio: null,
      searchEngine: 'postgres',
    } as unknown as AutoSignals;
    const live = (id: string) => (id === 'aws.autoscale_code' ? 'off' : null);
    expect(
      autoWants(
        { ...base, autoscaleCodeMain: 'a1', autoscaleCodeApplied: 'b2' },
        live,
        new Set(),
      ).find((w) => w.id === 'aws.autoscale_code'),
    ).toMatchObject({ to: 'on' });
    // the next one flips back (the tfvars flag only carries the request)
    expect(
      autoWants(
        { ...base, autoscaleCodeMain: 'a1', autoscaleCodeApplied: 'b2' },
        () => 'on',
        new Set(),
      ).find((w) => w.id === 'aws.autoscale_code'),
    ).toMatchObject({ to: 'off' });
    expect(
      autoWants(
        { ...base, autoscaleCodeMain: 'a1', autoscaleCodeApplied: 'a1' },
        live,
        new Set(),
      ).find((w) => w.id === 'aws.autoscale_code'),
    ).toBeUndefined();
    expect(
      autoWants({ ...base }, live, new Set()).find(
        (w) => w.id === 'aws.autoscale_code',
      ),
    ).toBeUndefined();
  });
});
