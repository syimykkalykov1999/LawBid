import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createSocket, type Socket } from 'node:dgram';

/**
 * Owner 2026-10-26 (calls failover): a synthetic check of a call relay, the
 * same two things a phone does before media flows:
 *  1. one STUN Binding (RFC 8489 §3): the relay answers and tells us our
 *     public address;
 *  2. one TURN Allocate with the long-term credential (RFC 8656 §7.2,
 *     RFC 8489 §9.2): the first request is answered 401 with REALM and
 *     NONCE, the second carries USERNAME / REALM / NONCE /
 *     MESSAGE-INTEGRITY and must get a relayed address. The allocation is
 *     freed at once (Refresh with LIFETIME 0, RFC 8656 §7.3).
 * UDP only (what calls use first); each step has its own short timeout.
 * The login is a short one made for the check; nothing secret is logged.
 */

const MAGIC = 0x2112a442;
const BINDING = 0x0001;
const ALLOCATE = 0x0003;
const REFRESH = 0x0004;
const SUCCESS = 0x0100;
const ERROR = 0x0110;

const A_USERNAME = 0x0006;
const A_MESSAGE_INTEGRITY = 0x0008;
const A_ERROR_CODE = 0x0009;
const A_LIFETIME = 0x000d;
const A_REALM = 0x0014;
const A_NONCE = 0x0015;
const A_REQUESTED_TRANSPORT = 0x0019;

export const RELAY_STEP_TIMEOUT_MS = 2_000;

export interface RelayTarget {
  host: string;
  port: number;
}

export interface RelayLogin {
  username: string;
  credential: string;
}

export interface RelayStepResult {
  ok: boolean;
  ms: number;
  error?: string;
}

export interface RelayCheckResult {
  target: string;
  stun: RelayStepResult;
  turn: RelayStepResult;
}

interface Attr {
  type: number;
  value: Buffer;
}

function attr(type: number, value: Buffer): Buffer {
  const pad = (4 - (value.length % 4)) % 4;
  const head = Buffer.alloc(4);
  head.writeUInt16BE(type, 0);
  head.writeUInt16BE(value.length, 2);
  return Buffer.concat([head, value, Buffer.alloc(pad)]);
}

function header(type: number, bodyLength: number, tid: Buffer): Buffer {
  const h = Buffer.alloc(20);
  h.writeUInt16BE(type, 0);
  h.writeUInt16BE(bodyLength, 2);
  h.writeUInt32BE(MAGIC, 4);
  tid.copy(h, 8);
  return h;
}

/** The long-term credential key: MD5(username ":" realm ":" password). */
export function longTermKey(
  username: string,
  realm: string,
  password: string,
): Buffer {
  return createHash('md5').update(`${username}:${realm}:${password}`).digest();
}

/**
 * A STUN message. With [key], MESSAGE-INTEGRITY is added last: HMAC-SHA1
 * over the message whose header length already counts the 24 bytes of the
 * integrity attribute (RFC 8489 §14.5).
 */
export function encodeStun(
  type: number,
  tid: Buffer,
  attrs: Attr[],
  key?: Buffer,
): Buffer {
  const body = Buffer.concat(attrs.map((a) => attr(a.type, a.value)));
  if (!key) return Buffer.concat([header(type, body.length, tid), body]);
  const withMiLen = body.length + 24;
  const signed = Buffer.concat([header(type, withMiLen, tid), body]);
  const mi = createHmac('sha1', key).update(signed).digest();
  return Buffer.concat([signed, attr(A_MESSAGE_INTEGRITY, mi)]);
}

export interface StunMessage {
  type: number;
  tid: Buffer;
  attrs: Attr[];
}

export function decodeStun(buf: Buffer): StunMessage | null {
  if (buf.length < 20 || buf.readUInt32BE(4) !== MAGIC) return null;
  const len = buf.readUInt16BE(2);
  if (buf.length < 20 + len) return null;
  const attrs: Attr[] = [];
  let o = 20;
  while (o + 4 <= 20 + len) {
    const type = buf.readUInt16BE(o);
    const l = buf.readUInt16BE(o + 2);
    if (o + 4 + l > buf.length) break;
    attrs.push({ type, value: buf.subarray(o + 4, o + 4 + l) });
    o += 4 + l + ((4 - (l % 4)) % 4);
  }
  return { type: buf.readUInt16BE(0), tid: buf.subarray(8, 20), attrs };
}

function find(m: StunMessage, type: number): Buffer | undefined {
  return m.attrs.find((a) => a.type === type)?.value;
}

function errorCodeOf(m: StunMessage): number | null {
  const v = find(m, A_ERROR_CODE);
  if (!v || v.length < 4) return null;
  return (v[2] & 0x7) * 100 + v[3];
}

/** "turn:host:3478?transport=udp" / "stun:host" -> the UDP target. TURNS,
 * TCP-only and port-53 addresses are skipped (a phone tries UDP first). */
export function udpTargetOf(urls: string[]): RelayTarget | null {
  for (const raw of urls) {
    const m = /^(turn|stun):\[?([^\]\s/?:]+)\]?(?::(\d+))?(\?.*)?$/i.exec(
      raw.trim(),
    );
    if (!m) continue;
    if (/transport=tcp/i.test(m[4] ?? '')) continue;
    const port = m[3] ? Number(m[3]) : 3478;
    if (port === 53) continue;
    return { host: m[2], port };
  }
  return null;
}

/** One request, one answer with the same transaction id (or a timeout). */
function ask(
  sock: Socket,
  target: RelayTarget,
  msg: Buffer,
  tid: Buffer,
  timeoutMs: number,
): Promise<StunMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      sock.off('message', onMessage);
      reject(new Error(`no answer in ${timeoutMs} ms`));
    }, timeoutMs);
    timer.unref?.();
    const onMessage = (buf: Buffer) => {
      const m = decodeStun(buf);
      if (!m || !m.tid.equals(tid)) return;
      clearTimeout(timer);
      sock.off('message', onMessage);
      resolve(m);
    };
    sock.on('message', onMessage);
    sock.send(msg, target.port, target.host, (e) => {
      if (!e) return;
      clearTimeout(timer);
      sock.off('message', onMessage);
      reject(e);
    });
  });
}

const tid = () => randomBytes(12);

async function stunBinding(
  sock: Socket,
  target: RelayTarget,
  timeoutMs: number,
): Promise<void> {
  const id = tid();
  const res = await ask(
    sock,
    target,
    encodeStun(BINDING, id, []),
    id,
    timeoutMs,
  );
  if (res.type !== (BINDING | SUCCESS)) {
    throw new Error(`STUN answered ${errorCodeOf(res) ?? res.type}`);
  }
}

async function turnAllocate(
  sock: Socket,
  target: RelayTarget,
  login: RelayLogin,
  timeoutMs: number,
): Promise<void> {
  const transport = {
    type: A_REQUESTED_TRANSPORT,
    value: Buffer.from([17, 0, 0, 0]),
  };
  const first = tid();
  const challenge = await ask(
    sock,
    target,
    encodeStun(ALLOCATE, first, [transport]),
    first,
    timeoutMs,
  );
  let realm = find(challenge, A_REALM)?.toString('utf8');
  let nonce = find(challenge, A_NONCE);
  if (challenge.type !== (ALLOCATE | ERROR) || !realm || !nonce) {
    throw new Error('TURN did not ask for a login');
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const key = longTermKey(login.username, realm, login.credential);
    const id = tid();
    const auth = [
      transport,
      { type: A_USERNAME, value: Buffer.from(login.username, 'utf8') },
      { type: A_REALM, value: Buffer.from(realm, 'utf8') },
      { type: A_NONCE, value: nonce },
    ];
    const res = await ask(
      sock,
      target,
      encodeStun(ALLOCATE, id, auth, key),
      id,
      timeoutMs,
    );
    if (res.type === (ALLOCATE | SUCCESS)) {
      // Free the relay at once (best effort, not awaited for long).
      const rid = tid();
      const refresh = encodeStun(
        REFRESH,
        rid,
        [
          { type: A_LIFETIME, value: Buffer.from([0, 0, 0, 0]) },
          { type: A_USERNAME, value: Buffer.from(login.username, 'utf8') },
          { type: A_REALM, value: Buffer.from(realm, 'utf8') },
          { type: A_NONCE, value: nonce },
        ],
        key,
      );
      await ask(sock, target, refresh, rid, 500).catch(() => undefined);
      return;
    }
    const code = errorCodeOf(res);
    // 438 Stale Nonce: once more with the new nonce (RFC 8489 §9.2.4).
    if (code === 438 && attempt === 0) {
      realm = find(res, A_REALM)?.toString('utf8') ?? realm;
      nonce = find(res, A_NONCE) ?? nonce;
      continue;
    }
    throw new Error(
      code === 401
        ? 'TURN refused the login (401)'
        : `TURN answered ${code ?? res.type}`,
    );
  }
  throw new Error('TURN did not allocate');
}

/**
 * STUN Binding + TURN Allocate against one relay. Never throws; each step
 * reports ok / time / a short reason. [login] null = STUN only.
 */
export async function checkRelay(
  target: RelayTarget,
  login: RelayLogin | null,
  timeoutMs = RELAY_STEP_TIMEOUT_MS,
  socketFactory: () => Socket = () => createSocket('udp4'),
): Promise<RelayCheckResult> {
  const sock = socketFactory();
  sock.unref?.();
  const label = `${target.host}:${target.port}`;
  const step = async (run: () => Promise<void>): Promise<RelayStepResult> => {
    const started = Date.now();
    try {
      await run();
      return { ok: true, ms: Date.now() - started };
    } catch (e) {
      return {
        ok: false,
        ms: Date.now() - started,
        error: e instanceof Error ? e.message : 'error',
      };
    }
  };
  try {
    sock.on('error', () => undefined);
    const stun = await step(() => stunBinding(sock, target, timeoutMs));
    const turn = login
      ? await step(() => turnAllocate(sock, target, login, timeoutMs))
      : { ok: false, ms: 0, error: 'no TURN login' };
    return { target: label, stun, turn };
  } finally {
    try {
      sock.close();
    } catch {
      // Already closed.
    }
  }
}
