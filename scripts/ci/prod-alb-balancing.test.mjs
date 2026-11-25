// G2 (docs/dev/STAGE2_ARCH_PERF_2026-11-25.md): prod REST must not stick to one
// api task. AWS ELB "Edit target group attributes" (least outstanding requests
// for requests of unequal cost); only /socket.io/* keeps the AWSALB cookie on
// its own target group (infra/modules/alb). The module code was ready but OFF
// in prod; this guard keeps the prod defaults ON so nobody turns it back by
// accident.
//   node --test scripts/ci/prod-alb-balancing.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const prodVars = readFileSync(new URL('infra/envs/prod/variables.tf', root), 'utf8');
const prodMain = readFileSync(new URL('infra/envs/prod/main.tf', root), 'utf8');

function boolDefault(name) {
  const m = new RegExp(`variable "${name}"\\s*\\{[\\s\\S]*?default\\s*=\\s*(true|false)`).exec(prodVars);
  return m?.[1];
}

test('prod sends REST by least outstanding requests', () => {
  assert.equal(boolDefault('alb_least_outstanding_requests'), 'true');
});

test('prod keeps stickiness only on the /socket.io target group', () => {
  assert.equal(boolDefault('alb_websocket_target_group'), 'true');
});

test('prod passes both switches to the stack', () => {
  assert.match(prodMain, /alb_least_outstanding_requests\s*=\s*var\.alb_least_outstanding_requests/);
  assert.match(prodMain, /alb_websocket_target_group\s*=\s*var\.alb_websocket_target_group/);
});
