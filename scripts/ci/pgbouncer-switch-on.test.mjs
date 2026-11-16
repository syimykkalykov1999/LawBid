// Owner 14.11 (PgBouncer is needed; 13.11 outage, KNOWN_ERRORS 144): switching
// the pool ON must never move the API onto a pooler that cannot reach the
// database. Checked in the module source itself:
//   1. Terraform waits until the pooler service is steady (healthy tasks);
//   2. the pooler's health check proves the database answers (not only that
//      PgBouncer listens), so «steady» means «can serve queries»;
//   3. the address the API gets (DB_POOLER_HOST) exists only after that wait,
//      so a pooler that never gets healthy fails the apply BEFORE the API task
//      definition changes: the API stays on the direct database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tf = readFileSync(new URL('../../infra/modules/pgbouncer/main.tf', import.meta.url), 'utf8');
const block = (start) => {
  const i = tf.indexOf(start);
  assert.ok(i >= 0, `${start} not found`);
  let depth = 0;
  for (let j = tf.indexOf('{', i); j < tf.length; j++) {
    if (tf[j] === '{') depth++;
    if (tf[j] === '}' && --depth === 0) return tf.slice(i, j + 1);
  }
  throw new Error(`${start} not closed`);
};

test('the pooler service is waited for until steady', () => {
  assert.match(block('resource "aws_ecs_service" "this"'), /wait_for_steady_state\s*=\s*true/);
});

test("the pooler's health check reaches the database, not only itself", () => {
  const hc = tf.slice(tf.indexOf('healthCheck = {'), tf.indexOf('healthCheck = {') + 400);
  assert.match(hc, /pg_isready -h 127\.0\.0\.1/);
  assert.match(hc, /psql[^\n]*DATABASE_URL[^\n]*select 1/i);
});

test('the API gets the pooler address only after the service is steady', () => {
  assert.match(block('output "endpoint"'), /depends_on\s*=\s*\[\s*aws_ecs_service\.this\s*\]/);
});

// KNOWN_ERRORS 182 (16.11, ~25 min outage): switching the pool OFF destroyed
// PgBouncer while the services still pointed at it, then stopped half-way on
// `deleting Security Group … DependencyViolation`.
const wf = readFileSync(new URL('../../.github/workflows/infra-apply.yml', import.meta.url), 'utf8');
const stepAt = (name) => {
  const i = wf.indexOf(`- name: ${name}`);
  assert.ok(i >= 0, `step «${name}» not found`);
  return i;
};

test("the pooler's security group is deleted only after the database group dropped it", () => {
  assert.match(block('resource "aws_security_group" "svc"'), /lifecycle\s*{\s*create_before_destroy\s*=\s*true\s*}/);
});

test('switch off: the services are drained to the direct database BEFORE the apply', () => {
  const drain = stepAt('Pooler off, phase 1 - move the services to the direct database');
  const apply = stepAt('Apply exactly the confirmed plan');
  assert.ok(drain < apply, 'drain must come before the apply');
  const body = wf.slice(drain, apply);
  assert.match(body, /pooler_off == 'true'/);
  assert.match(body, /pooler-roll\.sh lawbid-prod drain pooler\.json/);
  assert.doesNotMatch(body, /continue-on-error/, 'a failed drain must stop the apply');
  assert.match(wf, /pooler-switch\.mjs plan\.json > \.\.\/\.\.\/\.\.\/pooler\.json/);
});

test('switch on (and any left-over): the services follow the pooler setting AFTER the apply', () => {
  const apply = stepAt('Apply exactly the confirmed plan');
  const align = stepAt('Services follow the pooler setting (on, off, left-over)');
  const record = stepAt('Record the file on main');
  assert.ok(apply < align && align < record);
  const body = wf.slice(align, record);
  assert.match(body, /pooler-roll\.sh lawbid-prod align/);
  assert.match(body, /steps\.apply\.outcome == 'failure'/, 'also after a failed apply');
});
