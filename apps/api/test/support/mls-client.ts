import {
  createCipheriv,
  createHmac,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import {
  acceptAll,
  createApplicationMessage,
  createCommit,
  createGroup,
  decodeMlsMessage,
  defaultCapabilities,
  defaultLifetime,
  emptyPskIndex,
  encodeMlsMessage,
  generateKeyPackageWithKey,
  getCiphersuiteFromName,
  getCiphersuiteImpl,
  joinGroup,
  processMessage,
  type CiphersuiteImpl,
  type ClientState,
  type KeyPackage,
  type PrivateKeyPackage,
  type Proposal,
} from 'ts-mls';

/**
 * Item 25 (e2e): a real MLS client (ts-mls, MIT — the library the web app
 * uses) driving the LawBid Delivery Service over HTTP, like the app will.
 * Everything secret stays in this object; the server only gets what an
 * MLS client sends to a Delivery Service.
 */
export const SUITE = 'MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519';

let impl: Promise<CiphersuiteImpl> | undefined;
export const cs = (): Promise<CiphersuiteImpl> =>
  (impl ??= getCiphersuiteImpl(getCiphersuiteFromName(SUITE)));

export const b64 = (b: Uint8Array): string => Buffer.from(b).toString('base64');
export const unb64 = (s: string): Uint8Array =>
  new Uint8Array(Buffer.from(s, 'base64'));

/** Minimal HTTP surface the client needs (supertest-backed in the spec). */
export interface Http {
  post(
    path: string,
    body: unknown,
  ): Promise<{ status: number; body: { data?: unknown; error?: unknown } }>;
  get(
    path: string,
  ): Promise<{ status: number; body: { data?: unknown; error?: unknown } }>;
  del(path: string): Promise<{ status: number }>;
}

type ConvState = {
  state: 'off' | 'pending' | 'on';
  reason: string | null;
  groupId: string | null;
  epoch: number | null;
  devices: { deviceId: string; userId: string; inGroup: boolean }[];
  removeDevices: string[];
};

export class MlsDeviceClient {
  deviceId = '';
  private sign!: { signKey: Uint8Array; publicKey: Uint8Array };
  /** My published KeyPackages and their private halves. */
  private packages: { pub: KeyPackage; priv: PrivateKeyPackage }[] = [];
  /** conversationId → my group state. */
  readonly groups = new Map<string, ClientState>();

  constructor(
    readonly http: Http,
    readonly userId: string,
    readonly platform: 'ios' | 'android' | 'macos' | 'web' = 'ios',
  ) {}

  async register(keyPackages = 3): Promise<void> {
    const s = await cs();
    this.sign = await s.signature.keygen();
    const res = await this.http.post('/api/v1/e2ee/devices', {
      signatureKey: b64(this.sign.publicKey),
      platform: this.platform,
    });
    if (res.status !== 201) {
      throw new Error(`register ${res.status} ${JSON.stringify(res.body)}`);
    }
    this.deviceId = (res.body.data as { id: string }).id;
    await this.upload(keyPackages);
  }

  identity(): string {
    return `${this.userId}:${this.deviceId}`;
  }

  async makeKeyPackage(identity = this.identity()): Promise<{
    pub: KeyPackage;
    priv: PrivateKeyPackage;
  }> {
    const s = await cs();
    const kp = await generateKeyPackageWithKey(
      {
        credentialType: 'basic',
        identity: new TextEncoder().encode(identity),
      },
      defaultCapabilities(),
      defaultLifetime,
      [],
      this.sign,
      s,
    );
    return { pub: kp.publicPackage, priv: kp.privatePackage };
  }

  static encodeKeyPackage(kp: KeyPackage): string {
    return b64(
      encodeMlsMessage({
        keyPackage: kp,
        wireformat: 'mls_key_package',
        version: 'mls10',
      }),
    );
  }

  async upload(n: number): Promise<{ status: number; body: unknown }> {
    const made: { pub: KeyPackage; priv: PrivateKeyPackage }[] = [];
    for (let i = 0; i < n; i += 1) made.push(await this.makeKeyPackage());
    this.packages.push(...made);
    const res = await this.http.post(
      `/api/v1/e2ee/devices/${this.deviceId}/key-packages`,
      { keyPackages: made.map((m) => MlsDeviceClient.encodeKeyPackage(m.pub)) },
    );
    return res;
  }

  async state(conversationId: string): Promise<ConvState> {
    const res = await this.http.get(
      `/api/v1/e2ee/conversations/${conversationId}`,
    );
    if (res.status !== 200) {
      throw new Error(`state ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.data as ConvState;
  }

  /** Creates the chat's group with only this device in it. */
  async createGroup(
    conversationId: string,
  ): Promise<{ status: number; body: unknown }> {
    const s = await cs();
    const groupId = new TextEncoder().encode(`lawbid:${conversationId}`);
    const own = await this.makeKeyPackage();
    const state = await createGroup(groupId, own.pub, own.priv, [], s);
    const res = await this.http.post(
      `/api/v1/e2ee/conversations/${conversationId}/group`,
      { deviceId: this.deviceId, groupId: b64(groupId) },
    );
    if (res.status === 201) this.groups.set(conversationId, state);
    return res;
  }

  /** Adds the given devices (claims a KeyPackage each) and/or removes the
   * given devices, in one commit sent as a PublicMessage. */
  async commit(
    conversationId: string,
    add: string[],
    remove: string[] = [],
  ): Promise<{ status: number; body: { data?: unknown; error?: unknown } }> {
    const s = await cs();
    const state = this.groups.get(conversationId)!;
    const proposals: Proposal[] = [];
    if (add.length) {
      const claimed = await this.http.post(
        `/api/v1/e2ee/conversations/${conversationId}/key-packages/claim`,
        { deviceIds: add },
      );
      if (claimed.status !== 200) return claimed;
      for (const c of claimed.body.data as {
        deviceId: string;
        keyPackage: string | null;
      }[]) {
        if (!c.keyPackage) throw new Error(`no KeyPackage for ${c.deviceId}`);
        const m = decodeMlsMessage(unb64(c.keyPackage), 0)![0];
        if (m.wireformat !== 'mls_key_package') throw new Error('not a kp');
        proposals.push({
          proposalType: 'add',
          add: { keyPackage: m.keyPackage },
        });
      }
    }
    for (const d of remove) {
      proposals.push({
        proposalType: 'remove',
        remove: { removed: leafOf(state, d) },
      });
    }
    const out = await createCommit(
      { state, cipherSuite: s },
      {
        extraProposals: proposals,
        wireAsPublicMessage: true,
        ratchetTreeExtension: true,
      },
    );
    const res = await this.http.post(
      `/api/v1/e2ee/conversations/${conversationId}/commits`,
      {
        deviceId: this.deviceId,
        epoch: Number(state.groupContext.epoch),
        commit: b64(encodeMlsMessage(out.commit)),
        addedDevices: add,
        removedDevices: remove,
        ...(out.welcome
          ? {
              welcome: b64(
                encodeMlsMessage({
                  welcome: out.welcome,
                  wireformat: 'mls_welcome',
                  version: 'mls10',
                }),
              ),
            }
          : {}),
      },
    );
    if (res.status === 201) this.groups.set(conversationId, out.newState);
    return res;
  }

  /** Joins every group a Welcome waits for. */
  async takeWelcomes(): Promise<string[]> {
    const s = await cs();
    const res = await this.http.get(
      `/api/v1/e2ee/welcomes?deviceId=${this.deviceId}`,
    );
    const joined: string[] = [];
    for (const w of res.body.data as {
      id: string;
      conversationId: string;
      welcome: string;
    }[]) {
      const m = decodeMlsMessage(unb64(w.welcome), 0)![0];
      if (m.wireformat !== 'mls_welcome') throw new Error('not a welcome');
      let state: ClientState | undefined;
      for (const p of this.packages) {
        try {
          state = await joinGroup(m.welcome, p.pub, p.priv, emptyPskIndex, s);
          break;
        } catch {
          // Not the KeyPackage this Welcome was made for.
        }
      }
      if (!state) throw new Error('no KeyPackage fits the Welcome');
      this.groups.set(w.conversationId, state);
      await this.http.del(`/api/v1/e2ee/welcomes/${w.id}`);
      joined.push(w.conversationId);
    }
    return joined;
  }

  /** Applies the commits made by others since my epoch. */
  async catchUp(conversationId: string): Promise<void> {
    const s = await cs();
    let state = this.groups.get(conversationId)!;
    const res = await this.http.get(
      `/api/v1/e2ee/conversations/${conversationId}/commits?after=${Number(state.groupContext.epoch)}`,
    );
    for (const c of res.body.data as { epoch: number; commit: string }[]) {
      if (c.epoch !== Number(state.groupContext.epoch)) continue;
      const m = decodeMlsMessage(unb64(c.commit), 0)![0];
      if (
        m.wireformat !== 'mls_public_message' &&
        m.wireformat !== 'mls_private_message'
      ) {
        throw new Error('not a commit');
      }
      const r = await processMessage(m, state, emptyPskIndex, acceptAll, s);
      state = r.newState;
    }
    this.groups.set(conversationId, state);
  }

  async encrypt(
    conversationId: string,
    text: string,
  ): Promise<{ ciphertext: string; epoch: number }> {
    const s = await cs();
    const state = this.groups.get(conversationId)!;
    const epoch = Number(state.groupContext.epoch);
    const out = await createApplicationMessage(
      state,
      new TextEncoder().encode(text),
      s,
    );
    this.groups.set(conversationId, out.newState);
    return {
      ciphertext: b64(
        encodeMlsMessage({
          privateMessage: out.privateMessage,
          wireformat: 'mls_private_message',
          version: 'mls10',
        }),
      ),
      epoch,
    };
  }

  async send(
    conversationId: string,
    text: string,
  ): Promise<{ status: number; body: { data?: unknown; error?: unknown } }> {
    const { ciphertext, epoch } = await this.encrypt(conversationId, text);
    return this.http.post(`/api/v1/conversations/${conversationId}/messages`, {
      clientMessageId: randomUUID(),
      type: 'mls',
      ciphertext,
      mlsEpoch: epoch,
      mlsDeviceId: this.deviceId,
      // Every MLS message carries a 32-byte franking tag (the server
      // requires it); [sendFranked] makes one a report can check.
      frankingTag: b64(
        createHmac('sha256', randomBytes(32)).update(text).digest(),
      ),
    });
  }

  /** PR 4: the app's payload with a franking key `k` inside and the tag
   * HMAC-SHA256(k, P) next to the ciphertext (Messenger's franking). */
  async sendFranked(
    conversationId: string,
    payload: Record<string, unknown>,
    extra: { fileId?: string } = {},
  ): Promise<{
    res: { status: number; body: { data?: unknown; error?: unknown } };
    plaintext: string;
  }> {
    const k = randomBytes(32);
    const plaintext = JSON.stringify({ v: 1, ...payload, k: b64(k) });
    const tag = createHmac('sha256', k).update(plaintext).digest();
    const { ciphertext, epoch } = await this.encrypt(conversationId, plaintext);
    const res = await this.http.post(
      `/api/v1/conversations/${conversationId}/messages`,
      {
        clientMessageId: randomUUID(),
        type: 'mls',
        ciphertext,
        mlsEpoch: epoch,
        mlsDeviceId: this.deviceId,
        frankingTag: b64(tag),
        ...(extra.fileId ? { fileId: extra.fileId } : {}),
      },
    );
    return { res, plaintext };
  }

  async decrypt(conversationId: string, ciphertext: string): Promise<string> {
    const s = await cs();
    const state = this.groups.get(conversationId)!;
    const m = decodeMlsMessage(unb64(ciphertext), 0)![0];
    if (m.wireformat !== 'mls_private_message') throw new Error('not private');
    const r = await processMessage(m, state, emptyPskIndex, acceptAll, s);
    this.groups.set(conversationId, r.newState);
    if (r.kind !== 'applicationMessage')
      throw new Error('not an application message');
    return new TextDecoder().decode(r.message);
  }
}

/** The leaf index of a device in my copy of the group's tree. */
function leafOf(state: ClientState, deviceId: string): number {
  for (let i = 0; i < state.ratchetTree.length; i += 2) {
    const n = state.ratchetTree[i];
    if (n?.nodeType !== 'leaf') continue;
    const cred = n.leaf.credential;
    if (
      cred.credentialType === 'basic' &&
      new TextDecoder().decode(cred.identity).endsWith(`:${deviceId}`)
    ) {
      return i / 2;
    }
  }
  throw new Error(`device ${deviceId} is not in my tree`);
}

/** PR 4: a file encrypted the way the app does it (format of
 * src/modules/chat/e2ee/e2ee-file.ts): "LBE1", a 7-byte nonce prefix,
 * then AES-256-GCM segments of 64 KiB. */
export function encryptE2eeFile(plain: Buffer, key: Buffer): Buffer {
  const prefix = randomBytes(7);
  const parts: Buffer[] = [Buffer.from('LBE1', 'latin1'), prefix];
  const seg = 64 * 1024;
  const count = Math.max(1, Math.ceil(plain.length / seg));
  for (let i = 0; i < count; i++) {
    const nonce = Buffer.alloc(12);
    prefix.copy(nonce, 0);
    nonce.writeUInt32BE(i, 7);
    nonce[11] = i === count - 1 ? 1 : 0;
    const c = createCipheriv('aes-256-gcm', key, nonce);
    parts.push(
      c.update(plain.subarray(i * seg, (i + 1) * seg)),
      c.final(),
      c.getAuthTag(),
    );
  }
  return Buffer.concat(parts);
}
