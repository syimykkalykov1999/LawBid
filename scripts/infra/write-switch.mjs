#!/usr/bin/env node
// Owner 2026-10-26: infra switches from the admin. The ONLY writer of
// infra/envs/prod/growth.auto.tfvars.json in CI (workflow infra-apply.yml).
//
//   node scripts/infra/write-switch.mjs <tfvars.json> <schema.json> '<changes JSON>'
//
// <changes JSON> is {"<key>": value} with keys as in the whitelist
// (apps/api/src/common/ops/infra-switches.ts): a top-level variable, or
// "growth.<k>" which lands in the "growth_switches" object. Every key and
// value is checked against the schema (booleans, whole numbers in range, one
// word of a fixed list). The whole resulting file is checked again, then
// written. Prints {"before": {...}} (the values the file held) on stdout.
// Exit 1 + a message on stderr on anything outside the whitelist: nothing is
// written then.
import { readFileSync, writeFileSync } from 'node:fs';

const GROWTH_CONTAINER = 'growth_switches';

function fail(msg) {
  process.stderr.write(`write-switch: ${msg}\n`);
  process.exit(1);
}

/** Checks [value] against one schema property; returns an error or null. */
export function checkProp(name, prop, value) {
  if (!prop) return `key ${name} is not in the whitelist`;
  if (prop.type === 'boolean') {
    return typeof value === 'boolean' ? null : `${name} must be true or false`;
  }
  if (prop.type === 'integer') {
    return Number.isInteger(value) &&
      value >= prop.minimum &&
      value <= prop.maximum
      ? null
      : `${name} must be a whole number ${prop.minimum}..${prop.maximum}`;
  }
  if (prop.type === 'string') {
    return typeof value === 'string' && prop.enum.includes(value)
      ? null
      : `${name} must be one of ${JSON.stringify(prop.enum)}`;
  }
  return `${name}: unsupported schema type`;
}

/** Every problem of the whole file against the schema. */
export function fileProblems(schema, file) {
  const out = [];
  if (!file || typeof file !== 'object' || Array.isArray(file)) {
    return ['the file must hold one JSON object'];
  }
  for (const [name, value] of Object.entries(file)) {
    const prop = schema.properties[name];
    if (prop && prop.type === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        out.push(`${name} must be an object`);
        continue;
      }
      for (const [inner, v] of Object.entries(value)) {
        const bad = checkProp(`${name}.${inner}`, prop.properties[inner], v);
        if (bad) out.push(bad);
      }
      continue;
    }
    const bad = checkProp(name, prop, value);
    if (bad) out.push(bad);
  }
  return out;
}

/** Applies [changes]; returns { file, before } or throws. */
export function applyChanges(schema, file, changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    throw new Error('changes must be a JSON object');
  }
  if (Object.keys(changes).length === 0) throw new Error('no changes');
  const next = JSON.parse(JSON.stringify(file));
  const before = {};
  for (const [key, value] of Object.entries(changes)) {
    if (key.startsWith('growth.')) {
      const inner = key.slice('growth.'.length);
      const prop = schema.properties[GROWTH_CONTAINER]?.properties?.[inner];
      const bad = checkProp(key, prop, value);
      if (bad) throw new Error(bad);
      const cur = next[GROWTH_CONTAINER] ?? {};
      before[key] = cur[inner] ?? null;
      next[GROWTH_CONTAINER] = { ...cur, [inner]: value };
    } else {
      const prop = schema.properties[key];
      if (prop && prop.type === 'object') {
        throw new Error(`key ${key} is not in the whitelist`);
      }
      const bad = checkProp(key, prop, value);
      if (bad) throw new Error(bad);
      before[key] = next[key] ?? null;
      next[key] = value;
    }
  }
  const problems = fileProblems(schema, next);
  if (problems.length) throw new Error(problems.join('; '));
  return { file: next, before };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const [filePath, schemaPath, changesRaw] = process.argv.slice(2);
  if (!filePath || !schemaPath || !changesRaw) {
    fail('usage: write-switch.mjs <tfvars.json> <schema.json> <changes JSON>');
  }
  let schema, file, changes;
  try {
    schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    file = JSON.parse(readFileSync(filePath, 'utf8'));
    changes = JSON.parse(changesRaw);
  } catch (e) {
    fail(`cannot read input: ${e.message}`);
  }
  const already = fileProblems(schema, file);
  if (already.length) fail(`the file on main is already invalid: ${already.join('; ')}`);
  try {
    const r = applyChanges(schema, file, changes);
    writeFileSync(filePath, `${JSON.stringify(r.file, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ before: r.before })}\n`);
  } catch (e) {
    fail(e.message);
  }
}
