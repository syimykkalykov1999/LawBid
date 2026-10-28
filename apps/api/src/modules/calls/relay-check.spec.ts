import { createHash, createHmac } from 'node:crypto';
import { createSocket, type Socket } from 'node:dgram';
import { checkRelay, decodeStun, udpTargetOf } from './relay-check';

/**
 * Owner 2026-10-26 (failover): the synthetic relay check against a tiny
 * TURN server on 127.0.0.1. The server checks MESSAGE-INTEGRITY with its
 * own code (node:crypto directly), so a wrong key or a wrong length in our
 * encoder fails the test.
 */

const MAGIC = 0x2112a442;

function reply(type: number, tid: Buffer, attrs: Buffer[] = []): Buffer {
  const body = Buffer.concat(attrs);
  const h = Buffer.alloc(20);
  h.writeUInt16BE(type, 0);
  h.writeUInt16BE(body.length, 2);
  h.writeUInt32BE(MAGIC, 4);
  tid.copy(h, 8);
  return Buffer.concat([h, body]);
}

function tlv(type: number, value: Buffer): Buffer {
  const pad = (4 - (value.length % 4)) % 4;
  const h = Buffer.alloc(4);
  h.writeUInt16BE(type, 0);
  h.writeUInt16BE(value.length, 2);
  return Buffer.concat([h, value, Buffer.alloc(pad)]);
}

function errorCode(code: number): Buffer {
  return tlv(0x0009, Buffer.from([0, 0, Math.floor(code / 100), code % 100]));
}

/** A minimal TURN server: Binding OK, Allocate 401 -> check MI -> OK. */
function fakeTurn(password: string, opts?: { silent?: boolean }) {
  const realm = 'lawbid.test';
  const nonce = 'n0nce';
  const seen: string[] = [];
  const sock: Socket = createSocket('udp4');
  sock.on('message', (buf, rinfo) => {
    if (opts?.silent) return;
    const m = decodeStun(buf);
    if (!m) return;
    const send = (b: Buffer) => sock.send(b, rinfo.port, rinfo.address);
    if (m.type === 0x0001) {
      seen.push('binding');
      send(reply(0x0101, m.tid));
      return;
    }
    if (m.type === 0x0003 || m.type === 0x0004) {
      const user = m.attrs.find((a) => a.type === 0x0006);
      const mi = m.attrs.find((a) => a.type === 0x0008);
      if (!user || !mi) {
        seen.push('challenge');
        send(
          reply(0x0113, m.tid, [
            errorCode(401),
            tlv(0x0014, Buffer.from(realm)),
            tlv(0x0015, Buffer.from(nonce)),
          ]),
        );
        return;
      }
      // Verify MESSAGE-INTEGRITY independently.
      const miStart = buf.indexOf(mi.value) - 4;
      const signed = Buffer.from(buf.subarray(0, miStart));
      signed.writeUInt16BE(miStart - 20 + 24, 2);
      const key = createHash('md5')
        .update(`${user.value.toString()}:${realm}:${password}`)
        .digest();
      const want = createHmac('sha1', key).update(signed).digest();
      if (!want.equals(mi.value)) {
        seen.push('bad-mi');
        send(reply(0x0113, m.tid, [errorCode(401)]));
        return;
      }
      seen.push(m.type === 0x0003 ? 'allocate' : 'refresh');
      send(reply(m.type | 0x0100, m.tid));
    }
  });
  return new Promise<{ port: number; seen: string[]; close: () => void }>(
    (resolve) => {
      sock.bind(0, '127.0.0.1', () =>
        resolve({
          port: sock.address().port,
          seen,
          close: () => sock.close(),
        }),
      );
    },
  );
}

describe('checkRelay (STUN Binding + TURN Allocate)', () => {
  it('a healthy relay: STUN ok, TURN allocates with the long-term login, then frees it', async () => {
    const srv = await fakeTurn('pass-1');
    try {
      const r = await checkRelay(
        { host: '127.0.0.1', port: srv.port },
        { username: 'u:1', credential: 'pass-1' },
      );
      expect(r.stun.ok).toBe(true);
      expect(r.turn).toMatchObject({ ok: true });
      expect(srv.seen).toEqual(['binding', 'challenge', 'allocate', 'refresh']);
    } finally {
      srv.close();
    }
  });

  it('a wrong password: TURN refused (401), STUN still ok', async () => {
    const srv = await fakeTurn('pass-1');
    try {
      const r = await checkRelay(
        { host: '127.0.0.1', port: srv.port },
        { username: 'u:1', credential: 'wrong' },
      );
      expect(r.stun.ok).toBe(true);
      expect(r.turn.ok).toBe(false);
      expect(r.turn.error).toContain('401');
      expect(srv.seen).toContain('bad-mi');
    } finally {
      srv.close();
    }
  });

  it('a dead relay: both steps fail by timeout, nothing throws', async () => {
    const srv = await fakeTurn('x', { silent: true });
    try {
      const r = await checkRelay(
        { host: '127.0.0.1', port: srv.port },
        { username: 'u', credential: 'x' },
        150,
      );
      expect(r.stun).toMatchObject({ ok: false });
      expect(r.stun.error).toContain('no answer');
      expect(r.turn.ok).toBe(false);
    } finally {
      srv.close();
    }
  });

  it('udpTargetOf: UDP first, skips TCP / TURNS / port 53', () => {
    expect(
      udpTargetOf([
        'turns:turn.cloudflare.com:443?transport=tcp',
        'turn:turn.cloudflare.com:53?transport=udp',
        'turn:turn.cloudflare.com:3478?transport=udp',
      ]),
    ).toEqual({ host: 'turn.cloudflare.com', port: 3478 });
    expect(udpTargetOf(['turn:own.example'])).toEqual({
      host: 'own.example',
      port: 3478,
    });
    expect(udpTargetOf(['turn:x:3478?transport=tcp'])).toBeNull();
  });
});
