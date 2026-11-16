// KNOWN_ERRORS 182: what infra-apply.yml reads from the plan around the apply.
// Run: node --test scripts/infra/pooler-switch.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poolerSwitch } from './pooler-switch.mjs';

const svc = (actions) => ({ address: 'module.stack.module.pgbouncer[0].aws_ecs_service.this', change: { actions } });
const td = (name, env, { unknown = false, actions = ['delete', 'create'] } = {}) => ({
  address: `module.stack.module.ecs.aws_ecs_task_definition.${name}`,
  change: {
    actions,
    after: unknown ? {} : {
      container_definitions: JSON.stringify([
        { name, environment: [{ name: 'FOO', value: 'x' }, ...env] },
        { name: 'clamav', environment: [{ name: 'DB_POOL_SIZE', value: '99' }] },
      ]),
    },
    after_unknown: unknown ? { container_definitions: true } : {},
  },
});

test('switch off: the pooler service is deleted, planned direct settings are read', () => {
  const r = poolerSwitch({ resource_changes: [
    svc(['delete']),
    td('api', [{ name: 'DB_POOL_SIZE', value: '5' }]),
    td('worker', [{ name: 'DB_POOL_SIZE', value: 5 }]),
  ] });
  assert.deepEqual(r, { off: true, on: false, env: { api: { DB_POOL_SIZE: '5' }, worker: { DB_POOL_SIZE: '5' } } });
});

test('switch on: the pooler service is created; its address is unknown before the apply', () => {
  const r = poolerSwitch({ resource_changes: [svc(['create']), td('api', [], { unknown: true }), td('worker', [], { unknown: true })] });
  assert.deepEqual(r, { off: false, on: true, env: { api: null, worker: null } });
});

test('a replaced pooler (Spot switch, KNOWN_ERRORS 119) is neither on nor off', () => {
  for (const actions of [['delete', 'create'], ['create', 'delete']]) {
    const r = poolerSwitch({ resource_changes: [svc(actions)] });
    assert.equal(r.off, false);
    assert.equal(r.on, false);
  }
});

test('only DB_POOL* of the app container are taken (no other values, not the sidecar)', () => {
  const r = poolerSwitch({ resource_changes: [td('api', [
    { name: 'DB_POOLER_HOST', value: 'pgbouncer.lawbid-prod.internal' },
    { name: 'DB_POOL_SIZE', value: '10' },
    { name: 'DATABASE_HOST_HINT', value: 'no' },
  ])] });
  assert.deepEqual(r.env.api, { DB_POOLER_HOST: 'pgbouncer.lawbid-prod.internal', DB_POOL_SIZE: '10' });
  assert.equal(r.env.worker, null);
});

test('a plan without the pooler or the app task definitions changes nothing', () => {
  assert.deepEqual(poolerSwitch({ resource_changes: [{ address: 'module.stack.aws_s3_bucket.x', change: { actions: ['update'] } }] }),
    { off: false, on: false, env: { api: null, worker: null } });
  assert.deepEqual(poolerSwitch({}), { off: false, on: false, env: { api: null, worker: null } });
});
