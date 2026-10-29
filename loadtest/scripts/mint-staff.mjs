// Tokens for the seeded STAFF accounts of local-docker/staff.sql (load-test
// databases only): one admin token + Redis admin session per staff member.
//   JWT_KEYS=.. JWT_ACTIVE_KID=.. node mint-staff.mjs <staff.txt> <out.json>
// staff.txt: "<k>\t<user id>\t<role>" lines (staff.sql \copy). Writes
// <out.json> {"staff":[{"t":token,"role":role,"id":id}]} and
// <out.json>.admin-sessions.txt for seed-admin-sessions.sh.
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { sign } from './jwt.mjs';

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('usage: mint-staff.mjs <staff.txt> <out.json>');
  process.exit(2);
}
const staff = [];
const sessions = [];
for (const line of readFileSync(src, 'utf8').split('\n')) {
  const [, id, role] = line.trim().split('\t');
  if (!id) continue;
  const jti = randomUUID();
  staff.push({ t: sign({ sub: id, role: 'admin', typ: 'admin' }, 'lawbid-admin', jti), role, id });
  sessions.push(`${jti} ${id}`);
}
writeFileSync(out, JSON.stringify({ staff }));
writeFileSync(`${out}.admin-sessions.txt`, sessions.join('\n') + '\n');
console.error(`minted ${staff.length} staff tokens -> ${out}`);
