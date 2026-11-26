// Item 25: checks web/js/mls.js (the web app's MLS client) in node, the way
// two browser tabs use it: one IndexedDB (an in-memory stand-in below), the
// real Web Locks of node (navigator.locks) and the real WebCrypto. A ts-mls
// peer plays the other member. Prints one JSON line {ok, checks} or
// {error}. Run by mls_js_test.dart; needs only node.
import * as t from '../../../../../web/vendor/ts-mls-1.6.4/ts-mls.min.js';

// ---- an in-memory IndexedDB with async callbacks (enough for mls.js) -------
const stores = new Map();
const later = (fn) => setTimeout(fn, 0);
globalThis.IDBKeyRange = { bound: (lo, hi) => ({ lo, hi }) };
globalThis.indexedDB = {
  open() {
    const req = {};
    later(() => {
      const fresh = stores.size === 0;
      const db = {
        createObjectStore: (n) => stores.set(n, new Map()),
        transaction: (n) => ({
          objectStore: () => {
            const s = stores.get(n);
            const op = (fn) => {
              const r = {};
              later(() => {
                r.result = fn();
                r.onsuccess?.();
              });
              return r;
            };
            return {
              get: (k) => op(() => s.get(k)),
              put: (v, k) => op(() => void s.set(k, v)),
              delete: (k) => op(() => void s.delete(k)),
              getAllKeys: (range) =>
                op(() => [...s.keys()].filter((k) => k >= range.lo && k <= range.hi)),
            };
          },
        }),
      };
      req.result = db;
      if (fresh) req.onupgradeneeded?.();
      req.onsuccess?.();
    });
    return req;
  },
};

const tab = async (name) => import(new URL(`../../../../../web/js/mls.js?tab=${name}`, import.meta.url));
const SUITE = 'MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519';
const cs = await t.getCiphersuiteImpl(t.getCiphersuiteFromName(SUITE));
const b64 = (u8) => Buffer.from(u8).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
const text = (s) => b64(new TextEncoder().encode(s));
const checks = [];
const check = (name, ok) => {
  if (!ok) throw new Error(`failed: ${name}`);
  checks.push(name);
};

// The other member (alice), plain ts-mls.
const aliceSign = await cs.signature.keygen();
const aliceKp = async () =>
  t.generateKeyPackageWithKey(
    { credentialType: 'basic', identity: new TextEncoder().encode('ua:da') },
    t.defaultCapabilities(),
    t.defaultLifetime,
    [],
    aliceSign,
    cs,
  );
async function invite(gid, kpB64) {
  const own = await aliceKp();
  let state = await t.createGroup(gid, own.publicPackage, own.privatePackage, [], cs);
  const kp = t.decodeMlsMessage(unb64(kpB64), 0)[0].keyPackage;
  const out = await t.createCommit(
    { state, cipherSuite: cs },
    { extraProposals: [{ proposalType: 'add', add: { keyPackage: kp } }], ratchetTreeExtension: true },
  );
  state = out.newState;
  const welcome = b64(t.encodeMlsMessage({ welcome: out.welcome, wireformat: 'mls_welcome', version: 'mls10' }));
  return { state, welcome };
}
async function aliceRead(state, msgB64) {
  const m = t.decodeMlsMessage(unb64(msgB64), 0)[0];
  const r = await t.processMessage(m, state, t.emptyPskIndex, t.acceptAll, cs);
  return { state: r.newState, text: new TextDecoder().decode(r.message) };
}

try {
  const a = await tab('a');
  const b = await tab('b');
  await a.open('ub');
  await a.setDeviceId('dweb');
  await b.open('ub');

  // Two tabs write the same group at once: the Web Lock serialises them, so
  // each message gets its own ratchet step and both open at alice's.
  const g1 = new TextEncoder().encode('lawbid:c1');
  const [kp1] = JSON.parse(await a.newKeyPackages(1));
  let alice = await invite(g1, kp1);
  await a.join(alice.welcome);
  const [m1, m2] = await Promise.all([a.encrypt(b64(g1), text('from tab A')), b.encrypt(b64(g1), text('from tab B'))]);
  const r1 = await aliceRead(alice.state, m1);
  const r2 = await aliceRead(r1.state, m2);
  alice.state = r2.state;
  check('two tabs, one group: both messages open', r1.text === 'from tab A' && r2.text === 'from tab B');

  // A pending commit survives a reload (it waits in IndexedDB), and while
  // it waits no tab makes another one for that group.
  const carol = await t.generateKeyPackageWithKey(
    { credentialType: 'basic', identity: new TextEncoder().encode('uc:dc') },
    t.defaultCapabilities(),
    t.defaultLifetime,
    [],
    await cs.signature.keygen(),
    cs,
  );
  const carolKp = b64(t.encodeMlsMessage({ keyPackage: carol.publicPackage, wireformat: 'mls_key_package', version: 'mls10' }));
  const before = await a.epoch(b64(g1));
  const out = JSON.parse(await a.commit(b64(g1), JSON.stringify([carolKp]), '[]'));
  check('the commit says its epoch', out.epoch === before);
  let refused = false;
  try {
    await b.commit(b64(g1), '[]', '[]');
  } catch {
    refused = true;
  }
  check('one pending commit per group across tabs', refused);
  const reloaded = await tab('a-reloaded');
  await reloaded.open('ub');
  check('not applied before the server answered', (await reloaded.epoch(b64(g1))) === before);
  await reloaded.merge(b64(g1));
  check('merged after a reload', (await reloaded.epoch(b64(g1))) === before + 1);
  const disc = JSON.parse(await b.commit(b64(g1), '[]', '[]'));
  await a.discard(b64(g1));
  check('a discarded commit changes nothing', (await b.epoch(b64(g1))) === disc.epoch);

  // RFC 9420 §16.8: the last-resort KeyPackage serves several Welcomes.
  const last = await a.newLastResortKeyPackage();
  const g2 = new TextEncoder().encode('lawbid:c2');
  const g3 = new TextEncoder().encode('lawbid:c3');
  const inv2 = await invite(g2, last);
  const inv3 = await invite(g3, last);
  await a.join(inv2.welcome);
  await a.join(inv3.welcome);
  check('the last-resort package joins two groups', (await a.hasGroup(b64(g2))) && (await a.hasGroup(b64(g3))));

  // Decrypted texts stay sealed in IndexedDB.
  await a.ptPut('m1', 'c1', JSON.stringify({ b: 'privileged words' }));
  const raw = JSON.stringify([...stores.get('kv').values()].map((v) => (v?.ct ? Buffer.from(v.ct).toString() : '')));
  check('the decrypted text is not readable in IndexedDB', !raw.includes('privileged words'));
  check('it reads back', JSON.parse(await b.ptGet('m1')).b === 'privileged words');
  check('all of them', JSON.parse(await a.ptAll()).m1[0] === 'c1');
  await a.ptDel('m1');
  check('and one goes', (await a.ptGet('m1')) === null);

  // Sign-out: nothing of the account is left.
  await a.ptPut('m2', 'c1', '{}');
  await a.wipe();
  const left = [...stores.get('kv').keys()].filter((k) => k.includes('ub'));
  check('sign-out leaves nothing of the account', left.length === 0);

  process.stdout.write(JSON.stringify({ ok: true, checks }) + '\n');
} catch (e) {
  process.stdout.write(JSON.stringify({ error: String(e?.stack ?? e), checks }) + '\n');
}
