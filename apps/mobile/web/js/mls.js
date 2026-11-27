// Item 25 (docs/architecture/E2EE_MLS_PLAN_2026-11-25.md): the web app's
// MLS client (RFC 9420). The phones use OpenMLS; the web build (--wasm)
// cannot load it, so the browser uses ts-mls 1.6.4 (MIT), used unmodified
// from ../vendor/ts-mls-1.6.4/ (built by tool/web_mls/build.sh, see
// THIRD_PARTY_NOTICES.md). Same cipher suite and wire format as the phones.
//
// Every value crossing to Dart is base64 of an encoded MLSMessage (or of
// plain bytes). State stays in this browser: IndexedDB, every record sealed
// with AES-256-GCM under a non-extractable CryptoKey that never leaves the
// browser (the same scheme the `openmls` package uses on the web).
//
// Several tabs of the app share this state. Every function that reads and
// writes it runs under one Web Lock per account (navigator.locks, the
// browsers' cross-tab mutex), so two tabs never interleave a read-modify-
// write of a group, of the KeyPackage list or of a pending commit.
let lib;
let cfg;
const SUITE = 'MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519';

async function m() {
  lib ??= await import('../vendor/ts-mls-1.6.4/ts-mls.min.js');
  return lib;
}

const b64 = (u8) => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  }
  return btoa(s);
};
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const enc = new TextEncoder();
const dec = new TextDecoder();

// ---- sealed IndexedDB ----------------------------------------------------
const DB = 'lawbid-mls';
function idb() {
  return new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}
async function raw(op, key, value) {
  const db = await idb();
  return new Promise((ok, fail) => {
    const tx = db.transaction('kv', op === 'get' || op === 'keys' ? 'readonly' : 'readwrite');
    const s = tx.objectStore('kv');
    const r =
      op === 'get'
        ? s.get(key)
        : op === 'put'
          ? s.put(value, key)
          : op === 'keys'
            ? s.getAllKeys(IDBKeyRange.bound(key, `${key}￿`))
            : s.delete(key);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}
let sealKey;
async function seal() {
  if (sealKey) return sealKey;
  sealKey = await raw('get', 'seal-key');
  if (!sealKey) {
    sealKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    await raw('put', 'seal-key', sealKey);
  }
  return sealKey;
}
async function put(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(key) }, await seal(), bytes),
  );
  await raw('put', key, { iv, ct });
}
async function get(key) {
  const v = await raw('get', key);
  if (!v) return null;
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: v.iv, additionalData: enc.encode(key) }, await seal(), v.ct),
  );
}
const del = (key) => raw('delete', key);
const keysWith = (prefix) => raw('keys', prefix);

// ---- one writer at a time across tabs --------------------------------------
/** Runs [fn] under the account's Web Lock (all tabs of this browser). */
function locked(fn, name = () => me.userId) {
  return (...args) => {
    const locks = globalThis.navigator?.locks;
    if (!locks) return fn(...args);
    return locks.request(`lawbid-mls:${name(...args)}`, () => fn(...args));
  };
}

// ---- the client ------------------------------------------------------------
let cs;
const me = {};

async function suite() {
  const t = await m();
  cs ??= await t.getCiphersuiteImpl(t.getCiphersuiteFromName(SUITE));
  cfg ??= t.defaultClientConfig;
  return cs;
}
const identity = () => enc.encode(`${me.userId}:${me.deviceId ?? ''}`);
const groupKey = (gid) => `group:${me.userId}:${hex(gid)}`;
const pendingKey = (gid) => `pending:${me.userId}:${hex(gid)}`;

async function loadState(gid) {
  const t = await m();
  const bytes = await get(groupKey(gid));
  if (!bytes) return null;
  const [gs] = t.decodeGroupState(bytes, 0);
  return { ...gs, clientConfig: cfg };
}
async function saveState(state) {
  const t = await m();
  await put(groupKey(state.groupContext.groupId), t.encodeGroupState(state));
}

/** Opens (or makes) this browser's device keys of [userId]; returns the
 * base64 public signature key and the remembered device id. */
export const open = locked(
  async (userId) => {
    await suite();
    me.userId = userId;
    let keys = await get(`keys:${userId}`);
    if (!keys) {
      const pair = await cs.signature.keygen();
      keys = enc.encode(JSON.stringify({ sign: b64(pair.signKey), pub: b64(pair.publicKey) }));
      await put(`keys:${userId}`, keys);
      await del(`device:${userId}`);
    }
    const k = JSON.parse(dec.decode(keys));
    me.sign = { signKey: unb64(k.sign), publicKey: unb64(k.pub) };
    const d = await get(`device:${userId}`);
    me.deviceId = d ? dec.decode(d) : null;
    return JSON.stringify({ publicKey: k.pub, deviceId: me.deviceId });
  },
  (userId) => userId,
);

export const setDeviceId = locked(async (id) => {
  me.deviceId = id;
  await put(`device:${me.userId}`, enc.encode(id));
});

/** Signs this browser's device out: keys, KeyPackages, groups, pending
 * commits and the decrypted messages of the account are deleted. */
export const wipe = locked(async () => {
  for (const prefix of [`keys:`, `device:`, `kps:`, `kplast:`]) await del(`${prefix}${me.userId}`);
  for (const prefix of [`group:${me.userId}:`, `pending:${me.userId}:`, `pt:${me.userId}:`]) {
    for (const k of await keysWith(prefix)) await del(k);
  }
  me.deviceId = null;
  me.sign = null;
});

async function freshKeyPackage() {
  const t = await m();
  return t.generateKeyPackageWithKey(
    { credentialType: 'basic', identity: identity() },
    t.defaultCapabilities(),
    t.defaultLifetime,
    [],
    me.sign,
    cs,
  );
}

async function makeKeyPackage(lastResort = false) {
  const t = await m();
  const kp = await t.generateKeyPackageWithKey(
    { credentialType: 'basic', identity: identity() },
    t.defaultCapabilities(),
    t.defaultLifetime,
    [],
    me.sign,
    cs,
  );
  const bytes = t.encodeMlsMessage({ keyPackage: kp.publicPackage, wireformat: 'mls_key_package', version: 'mls10' });
  const priv = kp.privatePackage;
  const row = {
    kp: b64(bytes),
    init: b64(priv.initPrivateKey),
    hpke: b64(priv.hpkePrivateKey),
    sig: b64(priv.signaturePrivateKey),
  };
  if (lastResort) {
    // RFC 9420 §16.8: the last-resort package may be used by several
    // Welcomes, so its private half stays after a join (only a newer
    // last-resort package replaces it).
    await put(`kplast:${me.userId}`, enc.encode(JSON.stringify(row)));
    return { bytes, kp };
  }
  // The private half is needed to join from a Welcome made for it.
  const list = JSON.parse(dec.decode((await get(`kps:${me.userId}`)) ?? enc.encode('[]')));
  list.push(row);
  await put(`kps:${me.userId}`, enc.encode(JSON.stringify(list.slice(-300))));
  return { bytes, kp };
}

/** [n] one-time KeyPackages, base64 MLSMessages, as a JSON array. */
export const newKeyPackages = locked(async (n) => {
  const out = [];
  for (let i = 0; i < n; i++) out.push(b64((await makeKeyPackage()).bytes));
  return JSON.stringify(out);
});

/** The device's last-resort KeyPackage (base64 MLSMessage). */
export const newLastResortKeyPackage = locked(async () => b64((await makeKeyPackage(true)).bytes));

export const createGroup = locked(async (gidB64) => {
  const t = await m();
  const own = await makeKeyPackage();
  const state = await t.createGroup(unb64(gidB64), own.kp.publicPackage, own.kp.privatePackage, [], cs);
  await saveState(state);
});

export async function hasGroup(gidB64) {
  return (await loadState(unb64(gidB64))) !== null;
}

export async function epoch(gidB64) {
  const s = await loadState(unb64(gidB64));
  return s ? Number(s.groupContext.epoch) : -1;
}

function leafOf(state, deviceId) {
  for (let i = 0; i < state.ratchetTree.length; i += 2) {
    const n = state.ratchetTree[i];
    if (n?.nodeType !== 'leaf') continue;
    const id = dec.decode(n.leaf.credential.identity);
    if (id.endsWith(`:${deviceId}`)) return i / 2;
  }
  return -1;
}

/** A commit adding the KeyPackages / removing the devices (JSON arrays);
 * returns JSON {commit, welcome, epoch}. Applied only by merge(). The state
 * after it waits in IndexedDB (a reload or another tab still finds it);
 * one pending commit per group: while one waits, another is refused. */
export const commit = locked(async (gidB64, kpsJson, removeJson, withInfo) => {
  const t = await m();
  const gid = unb64(gidB64);
  if (await get(pendingKey(gid))) throw new Error('mls: a commit of this group is pending');
  const state = await loadState(gid);
  const proposals = [];
  for (const k of JSON.parse(kpsJson)) {
    const msg = t.decodeMlsMessage(unb64(k), 0)[0];
    proposals.push({ proposalType: 'add', add: { keyPackage: msg.keyPackage } });
  }
  for (const d of JSON.parse(removeJson)) {
    const leaf = leafOf(state, d);
    if (leaf >= 0) proposals.push({ proposalType: 'remove', remove: { removed: leaf } });
  }
  const out = await t.createCommit(
    { state, cipherSuite: cs },
    { extraProposals: proposals, wireAsPublicMessage: true, ratchetTreeExtension: true },
  );
  const commitB64 = b64(t.encodeMlsMessage(out.commit));
  // Groups: the GroupInfo of the epoch this commit makes (ratchet tree and
  // external_pub inside), for the devices that join by external commit.
  const info = withInfo ? await groupInfoOf(out.newState) : null;
  await put(
    pendingKey(gid),
    enc.encode(
      JSON.stringify({
        base: Number(state.groupContext.epoch),
        commit: commitB64,
        state: b64(t.encodeGroupState(out.newState)),
      }),
    ),
  );
  return JSON.stringify({
    commit: commitB64,
    epoch: Number(state.groupContext.epoch),
    welcome: out.welcome
      ? b64(t.encodeMlsMessage({ welcome: out.welcome, wireformat: 'mls_welcome', version: 'mls10' }))
      : null,
    groupInfo: info,
  });
});

async function groupInfoOf(state) {
  const t = await m();
  const gi = await t.createGroupInfoWithExternalPubAndRatchetTree(state, [], cs);
  return b64(t.encodeMlsMessage({ groupInfo: gi, wireformat: 'mls_group_info', version: 'mls10' }));
}

/** The GroupInfo of the group's current epoch (base64 MLSMessage). */
export async function exportGroupInfo(gidB64) {
  return groupInfoOf(await loadState(unb64(gidB64)));
}

/** Joins the group a GroupInfo (base64) describes by an external commit
 * (RFC 9420 §12.4.3.2); with [resync] this device's old leaf (its
 * signature key) goes in the same commit. Like commit(): the new state
 * waits in IndexedDB until merge() (the server took it); a refusal is
 * deleteGroup(). Returns JSON {groupId, commit, epoch, groupInfo}. */
export const joinExternal = locked(async (giB64, resync) => {
  const t = await m();
  const gi = t.decodeMlsMessage(unb64(giB64), 0)[0].groupInfo;
  if (!gi) throw new Error('mls: not a GroupInfo');
  const gid = gi.groupContext.groupId;
  const kp = await freshKeyPackage();
  const out = await t.joinGroupExternal(gi, kp.publicPackage, kp.privatePackage, !!resync, cs);
  const commitB64 = b64(
    t.encodeMlsMessage({ publicMessage: out.publicMessage, wireformat: 'mls_public_message', version: 'mls10' }),
  );
  const state = { ...out.newState, clientConfig: cfg };
  await put(
    pendingKey(gid),
    enc.encode(
      JSON.stringify({
        base: Number(gi.groupContext.epoch),
        external: true,
        commit: commitB64,
        state: b64(t.encodeGroupState(state)),
      }),
    ),
  );
  return JSON.stringify({
    groupId: b64(gid),
    commit: commitB64,
    epoch: Number(gi.groupContext.epoch),
    groupInfo: await groupInfoOf(state),
  });
});

/** RFC 9420 §8.5 MLS-Exporter of the current epoch (base64). */
export async function exportSecret(gidB64, label, contextB64, length) {
  const t = await m();
  const s = await loadState(unb64(gidB64));
  return b64(await t.mlsExporter(s.keySchedule.exporterSecret, label, unb64(contextB64), length, cs));
}

export const merge = locked(async (gidB64) => {
  const t = await m();
  const gid = unb64(gidB64);
  const p = await get(pendingKey(gid));
  if (!p) return;
  const rec = JSON.parse(dec.decode(p));
  const now = await loadState(gid);
  // The group moved on in the meantime (another tab): nothing to merge. An
  // external join replaces whatever copy of the group was here (resync).
  if (rec.external ? !now || Number(now.groupContext.epoch) <= rec.base : now && Number(now.groupContext.epoch) === rec.base) {
    const [gs] = t.decodeGroupState(unb64(rec.state), 0);
    await saveState({ ...gs, clientConfig: cfg });
  }
  await del(pendingKey(gid));
});

export const discard = locked(async (gidB64) => {
  await del(pendingKey(unb64(gidB64)));
});

/** Joins from a Welcome (base64); returns the base64 group id. */
export const join = locked(async (welcomeB64) => {
  const t = await m();
  const msg = t.decodeMlsMessage(unb64(welcomeB64), 0)[0];
  const list = JSON.parse(dec.decode((await get(`kps:${me.userId}`)) ?? enc.encode('[]')));
  const last = await get(`kplast:${me.userId}`);
  const tries = [...list, ...(last ? [{ ...JSON.parse(dec.decode(last)), lastResort: true }] : [])];
  for (const k of tries) {
    const pub = t.decodeMlsMessage(unb64(k.kp), 0)[0].keyPackage;
    const priv = { initPrivateKey: unb64(k.init), hpkePrivateKey: unb64(k.hpke), signaturePrivateKey: unb64(k.sig) };
    try {
      const state = await t.joinGroup(msg.welcome, pub, priv, t.emptyPskIndex, cs);
      await saveState(state);
      // A one-time KeyPackage is used once; the last-resort one stays.
      if (!k.lastResort) {
        await put(`kps:${me.userId}`, enc.encode(JSON.stringify(list.filter((x) => x !== k))));
      }
      return b64(state.groupContext.groupId);
    } catch {
      // Not the KeyPackage this Welcome was made for.
    }
  }
  throw new Error('no KeyPackage of this device fits the Welcome');
});

async function process(gidB64, msgB64) {
  const t = await m();
  const state = await loadState(unb64(gidB64));
  const msg = t.decodeMlsMessage(unb64(msgB64), 0)[0];
  const r = await t.processMessage(msg, state, t.emptyPskIndex, t.acceptAll, cs);
  await saveState(r.newState);
  return r;
}

export const applyCommit = locked(async (gidB64, commitB64) => {
  await process(gidB64, commitB64);
});

export const encrypt = locked(async (gidB64, plainB64) => {
  const t = await m();
  const state = await loadState(unb64(gidB64));
  const out = await t.createApplicationMessage(state, unb64(plainB64), cs);
  await saveState(out.newState);
  return b64(
    t.encodeMlsMessage({ privateMessage: out.privateMessage, wireformat: 'mls_private_message', version: 'mls10' }),
  );
});

/** The base64 plaintext of an application message, or null. */
export const decrypt = locked(async (gidB64, msgB64) => {
  const r = await process(gidB64, msgB64);
  return r.kind === 'applicationMessage' ? b64(r.message) : null;
});

/** JSON [{identity, key}] of the members now. */
export async function members(gidB64) {
  const state = await loadState(unb64(gidB64));
  const out = [];
  for (let i = 0; i < state.ratchetTree.length; i += 2) {
    const n = state.ratchetTree[i];
    if (n?.nodeType !== 'leaf') continue;
    out.push({ identity: dec.decode(n.leaf.credential.identity), key: b64(n.leaf.signaturePublicKey) });
  }
  return JSON.stringify(out);
}

export const deleteGroup = locked(async (gidB64) => {
  const gid = unb64(gidB64);
  await del(groupKey(gid));
  await del(pendingKey(gid));
});

// ---- decrypted messages (E2eePlaintexts on the web) -------------------------
// An MLS message opens once; what it said stays on the device. In the
// browser that copy is sealed like the MLS state (not in the plain cache).
const ptKey = (id) => `pt:${me.userId}:${id}`;

/** The JSON payload of message [id], or null. */
export async function ptGet(id) {
  const v = await get(ptKey(id));
  return v ? JSON.parse(dec.decode(v)).p : null;
}

export async function ptPut(id, conversationId, payload) {
  await put(ptKey(id), enc.encode(JSON.stringify({ c: conversationId, p: payload })));
}

export async function ptDel(id) {
  await del(ptKey(id));
}

/** JSON {id: [conversationId, payload]} of every decrypted message. */
export async function ptAll() {
  const out = {};
  const prefix = ptKey('');
  for (const k of await keysWith(prefix)) {
    const v = await get(k);
    if (!v) continue;
    const r = JSON.parse(dec.decode(v));
    out[k.slice(prefix.length)] = [r.c, r.p];
  }
  return JSON.stringify(out);
}
