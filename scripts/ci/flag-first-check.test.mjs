import test from 'node:test';
import assert from 'node:assert/strict';

// The module reads git on import, so test the pure function through a tiny re-implementation call.
process.argv[2] = 'HEAD';
const { analyse } = await import('./flag-first-check.mjs');

const route = (extra = '') =>
  `+++ b/apps/api/src/modules/cases/cases.controller.ts\n+  @Get('x')\n${extra}`;
test('a new route with no flag is reported', () => {
  const r = analyse(route());
  assert.equal(r.routes.length, 1);
  assert.equal(r.flagTouched, false);
});
test('a flag check in the diff satisfies it', () => {
  assert.equal(analyse(route('+  if (!(await this.flags.isEnabled("x"))) return;\n')).flagTouched, true);
});
test('the waiver comment satisfies it', () => {
  assert.ok(analyse(route('+  // flag: none read-only public list, no behaviour change\n')).waiver);
});
test('admin controllers are exempt', () => {
  assert.equal(analyse('+++ b/apps/api/src/modules/admin-ops/admin-ops.controller.ts\n+  @Get("x")\n').routes.length, 0);
});
test('specs are ignored', () => {
  assert.equal(analyse('+++ b/apps/api/src/modules/cases/cases.controller.spec.ts\n+  @Get("x")\n').routes.length, 0);
});
