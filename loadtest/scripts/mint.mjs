// Mints access tokens for the SEEDED load accounts - never real people.
// Same ids and claims as apps/api/bench/mint-tokens.mjs (md5('u'||n) uuids of
// scripts/ops/admin-load-gen.sql: clients n%10!=0, attorneys n%10==0), with
// node's own crypto so it runs anywhere with only `node` (runner, Mac).
//
//   JWT_SECRET=<secret> JWT_KID=j1 node mint.mjs <out.json> <clients> <attorneys> [admins]
//   (local run: JWT_KEYS="dev1:secret" JWT_ACTIVE_KID=dev1 is also understood)
// Also writes <out>.admin-sessions.txt: "<jti> <adminUserId>" lines; the
// admin guard needs a Redis key adm:sess:<jti> (seed-admin-sessions.sh).
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { sign, userId, access } from './jwt.mjs';

const [out, nc = '300', na = '100', nadm = '10'] = process.argv.slice(2);
if (!out) {
  console.error('usage: mint.mjs <out.json> <clients> <attorneys> [admins]');
  process.exit(2);
}
const want = { client: Number(nc), attorney: Number(na) };
const got = { client: [], attorney: [] };
for (let i = 0; got.client.length < want.client || got.attorney.length < want.attorney; i++) {
  const n = 1 + ((i * 37) % 99999);
  const role = n % 10 === 0 ? 'attorney' : 'client';
  if (got[role].length < want[role]) got[role].push(access(n, role));
  if (i > 400000) break;
}
const admins = [];
const sessions = [];
for (let k = 0; k < Number(nadm); k++) {
  const jti = randomUUID();
  admins.push(sign({ sub: userId(0), role: 'admin', typ: 'admin' }, 'lawbid-admin', jti));
  sessions.push(`${jti} ${userId(0)}`);
}
writeFileSync(out, JSON.stringify({ clients: got.client, attorneys: got.attorney, admins }));
writeFileSync(`${out}.admin-sessions.txt`, sessions.join('\n') + '\n');
console.error(`minted ${got.client.length} clients, ${got.attorney.length} attorneys, ${admins.length} admins -> ${out}`);
