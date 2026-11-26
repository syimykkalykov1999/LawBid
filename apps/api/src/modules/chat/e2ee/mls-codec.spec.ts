import {
  createApplicationMessage,
  createCommit,
  createGroup,
  defaultCapabilities,
  defaultLifetime,
  encodeMlsMessage,
  generateKeyPackageWithKey,
  getCiphersuiteFromName,
  getCiphersuiteImpl,
  type CiphersuiteImpl,
} from 'ts-mls';
import {
  checkKeyPackage,
  MLS_CIPHERSUITE,
  readApplicationMessage,
  readCommit,
  isWelcome,
} from './mls-codec';

/** Item 25: what the Delivery Service reads of MLS objects without keys. */
describe('mls-codec (E2EE, item 25)', () => {
  let cs: CiphersuiteImpl;
  beforeAll(async () => {
    cs = await getCiphersuiteImpl(getCiphersuiteFromName(MLS_CIPHERSUITE));
  });

  const kp = async (
    identity: string,
    sign: { signKey: Uint8Array; publicKey: Uint8Array },
  ) =>
    generateKeyPackageWithKey(
      { credentialType: 'basic', identity: new TextEncoder().encode(identity) },
      defaultCapabilities(),
      defaultLifetime,
      [],
      sign,
      cs,
    );
  const enc = (k: Awaited<ReturnType<typeof kp>>) =>
    encodeMlsMessage({
      keyPackage: k.publicPackage,
      wireformat: 'mls_key_package',
      version: 'mls10',
    });

  it('accepts a KeyPackage of exactly this device and refuses forgeries', async () => {
    const sign = await cs.signature.keygen();
    const other = await cs.signature.keygen();
    const good = enc(await kp('u1:d1', sign));
    expect(
      await checkKeyPackage(good, {
        identity: 'u1:d1',
        signatureKey: sign.publicKey,
      }),
    ).toEqual({ ok: true });
    expect(
      await checkKeyPackage(good, {
        identity: 'u2:d1',
        signatureKey: sign.publicKey,
      }),
    ).toEqual({ ok: false, why: 'credential' });
    expect(
      await checkKeyPackage(good, {
        identity: 'u1:d1',
        signatureKey: other.publicKey,
      }),
    ).toEqual({ ok: false, why: 'signature_key' });
    // A flipped byte in the signature (the last bytes of the package).
    const broken = new Uint8Array(good);
    broken[broken.length - 3] ^= 0xff;
    expect(
      (
        await checkKeyPackage(broken, {
          identity: 'u1:d1',
          signatureKey: sign.publicKey,
        })
      ).ok,
    ).toBe(false);
    expect(
      await checkKeyPackage(new Uint8Array([1, 2, 3]), {
        identity: 'u1:d1',
        signatureKey: sign.publicKey,
      }),
    ).toEqual({ ok: false, why: 'not_a_key_package' });
  });

  it('reads group id and epoch of messages and the adds of a public commit, never the text', async () => {
    const a = await kp('ua:da', await cs.signature.keygen());
    const b = await kp('ub:db', await cs.signature.keygen());
    const groupId = new TextEncoder().encode('lawbid:test');
    let state = await createGroup(
      groupId,
      a.publicPackage,
      a.privatePackage,
      [],
      cs,
    );
    const commit = await createCommit(
      { state, cipherSuite: cs },
      {
        extraProposals: [
          { proposalType: 'add', add: { keyPackage: b.publicPackage } },
        ],
        wireAsPublicMessage: true,
        ratchetTreeExtension: true,
      },
    );
    const c = readCommit(encodeMlsMessage(commit.commit));
    expect(c).toMatchObject({ epoch: 0, addedIdentities: ['ub:db'] });
    expect(Buffer.from(c!.groupId).toString()).toBe('lawbid:test');
    expect(
      isWelcome(
        encodeMlsMessage({
          welcome: commit.welcome!,
          wireformat: 'mls_welcome',
          version: 'mls10',
        }),
      ),
    ).toBe(true);
    state = commit.newState;
    const msg = await createApplicationMessage(
      state,
      new TextEncoder().encode('secret words'),
      cs,
    );
    const bytes = encodeMlsMessage({
      privateMessage: msg.privateMessage,
      wireformat: 'mls_private_message',
      version: 'mls10',
    });
    expect(readApplicationMessage(bytes)).toMatchObject({ epoch: 1 });
    expect(Buffer.from(bytes).includes(Buffer.from('secret words'))).toBe(
      false,
    );
    // A commit is not an application message and vice versa.
    expect(readApplicationMessage(encodeMlsMessage(commit.commit))).toBeNull();
    expect(readCommit(bytes)).toBeNull();
  });
});
