// G2 (docs/dev/STAGE2_ARCH_PERF_2026-11-25.md): prod REST must not stick to one
// api task. AWS ELB "Edit target group attributes" (least outstanding requests
// for requests of unequal cost); only /socket.io/* keeps the AWSALB cookie on
// its own target group (infra/modules/alb).
// The first apply with the switches ON re-registers the api ECS service, so the
// prod DEFAULTS stay false: the owner sets both true in tfvars and applies at
// night (docs/runbooks/infra-hardening.md §6). A default of true would put that
// ALB + ECS change into every admin «Авто» / «Масштаб» infra plan before then.
// This guard keeps the defaults off and both switches wired to the stack.
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

test('least outstanding requests: off by default, the owner turns it on with a night apply', () => {
  assert.equal(boolDefault('alb_least_outstanding_requests'), 'false');
});

test('socket-only stickiness group: off by default, the owner turns it on with a night apply', () => {
  assert.equal(boolDefault('alb_websocket_target_group'), 'false');
});

test('prod passes both switches to the stack', () => {
  assert.match(prodMain, /alb_least_outstanding_requests\s*=\s*var\.alb_least_outstanding_requests/);
  assert.match(prodMain, /alb_websocket_target_group\s*=\s*var\.alb_websocket_target_group/);
});
