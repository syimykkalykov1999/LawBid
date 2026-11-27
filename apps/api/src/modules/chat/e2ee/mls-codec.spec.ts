import {
  createApplicationMessage,
  createCommit,
  createGroup,
  createGroupInfoWithExternalPubAndRatchetTree,
  defaultCapabilities,
  defaultLifetime,
  encodeMlsMessage,
  generateKeyPackageWithKey,
  getCiphersuiteFromName,
  getCiphersuiteImpl,
  joinGroupExternal,
  type CiphersuiteImpl,
} from 'ts-mls';
import {
  checkKeyPackage,
  MLS_CIPHERSUITE,
  readApplicationMessage,
  readCommit,
  readExternalCommit,
  readGroupInfo,
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

  // Group E2EE G1 (GROUP_E2EE_DESIGN_2026-11-26.md §4.3): the GroupInfo a
  // device joins from and the external commit it joins with.
  it('reads a GroupInfo and an external commit (joiner identity, key, removes)', async () => {
    const aSign = await cs.signature.keygen();
    const bSign = await cs.signature.keygen();
    const a = await kp('ua:da', aSign);
    const b = await kp('ub:db', bSign);
    const groupId = new TextEncoder().encode('lawbid:g:test');
    const state = await createGroup(
      groupId,
      a.publicPackage,
      a.privatePackage,
      [],
      cs,
    );
    const info = await createGroupInfoWithExternalPubAndRatchetTree(
      state,
      [],
      cs,
    );
    const infoBytes = encodeMlsMessage({
      groupInfo: info,
      wireformat: 'mls_group_info',
      version: 'mls10',
    });
    const gi = readGroupInfo(infoBytes);
    expect(gi).toMatchObject({ epoch: 0 });
    expect(Buffer.from(gi!.groupId).toString()).toBe('lawbid:g:test');
    expect(readGroupInfo(new Uint8Array([1, 2, 3]))).toBeNull();

    const joined = await joinGroupExternal(
      info,
      b.publicPackage,
      b.privatePackage,
      false,
      cs,
    );
    const commitBytes = encodeMlsMessage({
      publicMessage: joined.publicMessage,
      wireformat: 'mls_public_message',
      version: 'mls10',
    });
    const ext = readExternalCommit(commitBytes);
    expect(ext).toMatchObject({ epoch: 0, identity: 'ub:db', removes: 0 });
    expect(Buffer.from(ext!.signatureKey)).toEqual(
      Buffer.from(bSign.publicKey),
    );
    // The member route sees it as external, and a member's commit is not one.
    expect(readCommit(commitBytes)).toMatchObject({ external: true });
    const member = await createCommit(
      { state, cipherSuite: cs },
      { wireAsPublicMessage: true },
    );
    const memberBytes = encodeMlsMessage(member.commit);
    expect(readCommit(memberBytes)).toMatchObject({ external: false });
    expect(readExternalCommit(memberBytes)).toBeNull();
    expect(readExternalCommit(infoBytes)).toBeNull();
  });
});
