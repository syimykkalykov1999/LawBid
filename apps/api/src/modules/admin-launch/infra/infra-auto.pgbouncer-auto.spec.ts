import { autoApplyBlockers } from './infra-auto.logic';

/**
 * Owner 16.11 («даже на авто я должен вводить коды?» — «Да»): the pooler's
 * automatic plans apply without a tap. Replays of the two real prod plans of
 * that day (requests cd13dfb6 on, 45f01121 off; task definitions and
 * in-place service updates included exactly as planned).
 */
const P = 'module.stack.module.pgbouncer[0].';
const own = [
  'aws_appautoscaling_policy.cpu',
  'aws_appautoscaling_target.this',
  'aws_cloudwatch_log_group.this',
  'aws_cloudwatch_metric_alarm.max_wait',
  'aws_cloudwatch_metric_alarm.no_healthy',
  'aws_cloudwatch_metric_alarm.server_connections',
  'aws_cloudwatch_metric_alarm.unhealthy',
  'aws_cloudwatch_metric_alarm.waiting',
  'aws_ecs_service.this',
  'aws_ecs_task_definition.this',
  'aws_iam_role.execution',
  'aws_iam_role.task',
  'aws_iam_role_policy.execution_secret',
  'aws_iam_role_policy_attachment.execution',
  'aws_security_group.svc',
  'aws_service_discovery_private_dns_namespace.this',
  'aws_service_discovery_service.this',
  'aws_vpc_security_group_egress_rule.svc_https',
  'aws_vpc_security_group_egress_rule.svc_to_db',
  'aws_vpc_security_group_ingress_rule.svc_from_clients',
].map((x) => P + x);
const around = (action: string) => [
  { address: 'module.stack.module.ecs.aws_ecs_service.api', action: 'update' },
  {
    address: 'module.stack.module.ecs.aws_ecs_service.api_admin[0]',
    action: 'update',
  },
  {
    address: 'module.stack.module.ecs.aws_ecs_service.worker',
    action: 'update',
  },
  {
    address: 'module.stack.module.ecs.aws_ecs_task_definition.api',
    action: 'delete-create',
  },
  {
    address: 'module.stack.module.ecs.aws_ecs_task_definition.migrate',
    action: 'delete-create',
  },
  {
    address: 'module.stack.module.ecs.aws_ecs_task_definition.worker',
    action: 'delete-create',
  },
  ...own.map((address) => ({ address, action })),
  {
    address: 'module.stack.module.postgres[0].aws_security_group.db',
    action: 'update',
  },
  {
    address: 'module.stack.module.spot_fallback[0].aws_iam_role_policy.lambda',
    action: 'update',
  },
  {
    address: 'module.stack.module.spot_fallback[0].aws_lambda_function.this',
    action: 'update',
  },
];

describe("PgBouncer «Авто» without the owner's code (16.11 prod plans)", () => {
  it('switch-on cd13dfb6 applies by itself', () => {
    expect(autoApplyBlockers('on', around('create'), 'aws.pgbouncer')).toEqual(
      [],
    );
  });

  it('switch-off 45f01121 applies by itself (the drain runs first)', () => {
    expect(autoApplyBlockers('off', around('delete'), 'aws.pgbouncer')).toEqual(
      [],
    );
  });

  it('serving infrastructure outside the pooler still waits for the owner', () => {
    const plan = [
      ...around('delete'),
      {
        address: 'module.stack.module.ecs.aws_ecs_service.api',
        action: 'delete',
      },
    ];
    expect(autoApplyBlockers('off', plan, 'aws.pgbouncer')).toEqual([
      'module.stack.module.ecs.aws_ecs_service.api: delete of serving infrastructure',
    ]);
  });

  it('another item may not remove the pooler', () => {
    expect(
      autoApplyBlockers(
        'off',
        [{ address: P + 'aws_ecs_service.this', action: 'delete' }],
        'aws.rds_replicas',
      ),
    ).not.toEqual([]);
  });
});
