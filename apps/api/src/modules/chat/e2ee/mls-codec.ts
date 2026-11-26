import {
  decodeMlsMessage,
  getCiphersuiteFromName,
  getCiphersuiteImpl,
  type CiphersuiteImpl,
  type MLSMessage,
} from 'ts-mls';
import { verifyKeyPackage } from 'ts-mls/keyPackage.js';

/**
 * Item 25 (docs/architecture/E2EE_MLS_PLAN_2026-11-25.md §3): what the
 * Delivery Service may read of an MLS object WITHOUT any key — the public
 * framing of RFC 9420 §6 (group id, epoch, content type), KeyPackages and
 * the proposals of a commit sent as a PublicMessage. Decoding is ts-mls
 * (MIT, RFC 9420, the same library the web client uses). The server never
 * holds an MLS secret, so it can never open an application message.
 */
export const MLS_CIPHERSUITE = 'MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519';

let impl: Promise<CiphersuiteImpl> | undefined;
function suite(): Promise<CiphersuiteImpl> {
  impl ??= getCiphersuiteImpl(getCiphersuiteFromName(MLS_CIPHERSUITE));
  return impl;
}

/** The MLS credential identity of a device: "<userId>:<deviceId>". */
export function deviceIdentity(userId: string, deviceId: string): string {
  return `${userId}:${deviceId}`;
}

function decode(bytes: Uint8Array): MLSMessage | null {
  try {
    const out = decodeMlsMessage(bytes, 0);
    if (!out) return null;
    const [message, used] = out;
    // Trailing bytes = not one clean MLSMessage.
    return used === bytes.length ? message : null;
  } catch {
    return null;
  }
}

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export type KeyPackageCheck =
  | { ok: true }
  | {
      ok: false;
      why:
        | 'not_a_key_package'
        | 'cipher_suite'
        | 'credential'
        | 'signature_key'
        | 'signature';
    };

/** A KeyPackage the device may publish: our cipher suite, a basic
 * credential naming exactly this device, its registered signature key,
 * and a valid signature over the package. */
export async function checkKeyPackage(
  bytes: Uint8Array,
  expect: { identity: string; signatureKey: Uint8Array },
): Promise<KeyPackageCheck> {
  const m = decode(bytes);
  if (!m || m.wireformat !== 'mls_key_package') {
    return { ok: false, why: 'not_a_key_package' };
  }
  const kp = m.keyPackage;
  if (kp.cipherSuite !== MLS_CIPHERSUITE) {
    return { ok: false, why: 'cipher_suite' };
  }
  const cred = kp.leafNode.credential;
  if (
    cred.credentialType !== 'basic' ||
    new TextDecoder().decode(cred.identity) !== expect.identity
  ) {
    return { ok: false, why: 'credential' };
  }
  if (!sameBytes(kp.leafNode.signaturePublicKey, expect.signatureKey)) {
    return { ok: false, why: 'signature_key' };
  }
  const s = await suite();
  if (!(await verifyKeyPackage(kp, s.signature))) {
    return { ok: false, why: 'signature' };
  }
  return { ok: true };
}

/** The public header of an application message (PrivateMessage). */
export function readApplicationMessage(
  bytes: Uint8Array,
): { groupId: Uint8Array; epoch: number } | null {
  const m = decode(bytes);
  if (!m || m.wireformat !== 'mls_private_message') return null;
  const pm = m.privateMessage;
  if (pm.contentType !== 'application') return null;
  return { groupId: pm.groupId, epoch: Number(pm.epoch) };
}

/** The public part of a commit. For a PublicMessage commit also the
 * identities its inline Add proposals add (the server checks them against
 * the devices the sender declares); `addedIdentities` is null for a commit
 * sent encrypted (PrivateMessage), which the server cannot look into. */
export function readCommit(bytes: Uint8Array): {
  groupId: Uint8Array;
  epoch: number;
  addedIdentities: string[] | null;
} | null {
  const m = decode(bytes);
  if (!m) return null;
  if (m.wireformat === 'mls_private_message') {
    const pm = m.privateMessage;
    if (pm.contentType !== 'commit') return null;
    return {
      groupId: pm.groupId,
      epoch: Number(pm.epoch),
      addedIdentities: null,
    };
  }
  if (m.wireformat !== 'mls_public_message') return null;
  const content = m.publicMessage.content;
  if (content.contentType !== 'commit') return null;
  const added: string[] = [];
  for (const p of content.commit.proposals) {
    if (p.proposalOrRefType !== 'proposal') {
      // A commit by reference names proposals the server never saw.
      return null;
    }
    if (p.proposal.proposalType === 'add') {
      const cred = p.proposal.add.keyPackage.leafNode.credential;
      if (cred.credentialType !== 'basic') return null;
      added.push(new TextDecoder().decode(cred.identity));
    }
  }
  return {
    groupId: content.groupId,
    epoch: Number(content.epoch),
    addedIdentities: added,
  };
}

export function isWelcome(bytes: Uint8Array): boolean {
  return decode(bytes)?.wireformat === 'mls_welcome';
}
