// Token helpers shared by mint.mjs and discover.mjs. Node's own crypto only.
// Same ids and claims as apps/api/bench/mint-tokens.mjs.
import { createHash, createHmac } from 'node:crypto';

let secret = process.env.JWT_SECRET;
const kid = process.env.JWT_KID || process.env.JWT_ACTIVE_KID || 'j1';
if (!secret && process.env.JWT_KEYS) {
  const map = Object.fromEntries(process.env.JWT_KEYS.split(',').map((p) => p.split(':')));
  secret = map[kid];
}
if (!secret) {
  console.error('JWT_SECRET (or JWT_KEYS + JWT_ACTIVE_KID) is required');
  process.exit(2);
}
const ttl = Number(process.env.TOKEN_TTL_SECONDS || 6 * 3600);

export const uuid = (s) => {
  const h = createHash('md5').update(s).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export function sign(payload, aud, jti) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT', kid });
  const body = b64({ ...payload, iat: now, exp: now + ttl, iss: 'lawbid', aud, ...(jti ? { jti } : {}) });
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
export const userId = (n) => uuid('u' + n);
/** Access token of a seeded person. n = seed number (md5('u'||n) is the user id). */
export const access = (n, role) =>
  sign(
    { sub: userId(n), role, sid: uuid('s' + n), verified: role === 'attorney', subscriptionStatus: role === 'attorney' ? 'active' : 'none', typ: 'access' },
    'lawbid-app',
  );
/** Access token for a user id we only know as a uuid (found through the API). */
export const accessFor = (sub, role) =>
  sign({ sub, role, sid: uuid('s-' + sub), verified: role === 'attorney', subscriptionStatus: role === 'attorney' ? 'active' : 'none', typ: 'access' }, 'lawbid-app');
