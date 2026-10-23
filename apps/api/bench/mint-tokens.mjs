// Mints access tokens for load accounts of the seeded perf database
// (scripts/ops/admin-load-gen.sql + user-load-gen.sql) without logging in.
// Usage: JWT_KEYS=dev1:secret JWT_ACTIVE_KID=dev1 [ROLE=attorney] \
//   node bench/mint-tokens.mjs [count] > tokens.json
// IDS_FILE=ids.txt: use real user ids (one per line) instead.
// Ids are md5('u'||n)::uuid (the seed): clients n%10!=0, attorneys n%10==0.
import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
if (!process.env.JWT_KEYS && existsSync('.env')) {
  for (const l of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^(JWT_KEYS|JWT_ACTIVE_KID)=(.*)$/.exec(l);
    if (m) process.env[m[1]] = m[2];
  }
}

const uuid = (s) => {
  const h = createHash('md5').update(s).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const keys = Object.fromEntries(
  process.env.JWT_KEYS.split(',').map((p) => p.split(':')),
);
const kid = process.env.JWT_ACTIVE_KID ?? 'dev1';
const count = Number(process.argv[2] ?? 200);
const role = process.env.ROLE ?? 'client';
const out = [];
const idsFile = process.env.IDS_FILE;
const ids = idsFile ? readFileSync(idsFile, 'utf8').split('\n').filter(Boolean) : null;
for (let i = 0; out.length < count; i++) {
  if (ids && i >= ids.length) break;
  const n = 1 + ((i * 37) % 99999);
  const isAtt = ids ? role === 'attorney' : n % 10 === 0;
  if (!ids && (role === 'attorney') !== isAtt) continue;
  out.push(
    jwt.sign(
      {
        sub: ids ? ids[i] : uuid('u' + n),
        role,
        sid: uuid('s' + n),
        verified: isAtt,
        subscriptionStatus: isAtt ? 'active' : 'none',
        typ: 'access',
      },
      keys[kid],
      {
        algorithm: 'HS256',
        keyid: kid,
        expiresIn: 86400,
        issuer: 'lawbid',
        audience: 'lawbid-app',
      },
    ),
  );
}
console.log(JSON.stringify(out));
