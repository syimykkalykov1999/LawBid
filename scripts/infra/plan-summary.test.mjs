// KNOWN_ERRORS 188: the workflow's second lock lets «Авто» remove the drained
// pooler and nothing else. Run: node --test scripts/infra/plan-summary.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { servingDestroys } from './plan-summary.mjs';

const P = 'module.stack.module.pgbouncer[0].';
// The real plan of request c48d4569 (16.11, «Авто» pooler off), serving part.
const plan = {
  resources: [
    { address: `${P}aws_ecs_service.this`, action: 'delete' },
    { address: `${P}aws_service_discovery_service.this`, action: 'delete' },
    { address: `${P}aws_service_discovery_private_dns_namespace.this`, action: 'delete' },
    { address: 'module.stack.module.ecs.aws_ecs_service.api', action: 'update' },
  ],
};

test('pooler off: its own drained service is not a serving destroy', () => {
  assert.deepEqual(servingDestroys(plan, { db_pooler_enabled: false }), []);
});

test('any other switch: the pooler service still counts', () => {
  assert.equal(servingDestroys(plan, {}).length, 3);
});

test('pooler off: the api service still counts', () => {
  const p = { resources: [...plan.resources, { address: 'module.stack.module.ecs.aws_ecs_service.api', action: 'delete' }] };
  assert.deepEqual(servingDestroys(p, { db_pooler_enabled: false }), ['module.stack.module.ecs.aws_ecs_service.api']);
});
