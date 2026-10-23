import {
  createHash,
  createSign,
  generateKeyPairSync,
  randomBytes,
  type KeyObject,
} from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';

/** The CBOR encoder's input type (via the library, not its transitive dep). */
type CBORType = Parameters<typeof isoCBOR.encode>[0];

/**
 * A software passkey for e2e suites: a P-256 key pair that answers
 * `navigator.credentials.create()` / `get()` the way a platform
 * authenticator would (attestation `none`, UP+UV flags, a signature
 * counter). It never leaves the test process; no browser involved.
 */
export class FakeAuthenticator {
  readonly credentialId = randomBytes(32).toString('base64url');
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  private counter = 0;
  private userHandle: Buffer | null = null;

  constructor(
    readonly origin: string,
    readonly rpId: string,
  ) {
    const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.privateKey = pair.privateKey;
    this.publicKey = pair.publicKey;
  }

  /** RegistrationResponseJSON for [options] (PublicKeyCredentialCreationOptionsJSON). */
  create(options: Record<string, unknown>): Record<string, unknown> {
    const user = options.user as { id: string };
    this.userHandle = Buffer.from(user.id, 'base64url');
    const clientDataJSON = this.clientData(
      'webauthn.create',
      options.challenge as string,
    );
    const authData = Buffer.concat([
      this.authDataHead(0x45), // UP | UV | AT
      Buffer.alloc(16), // aaguid
      uint16(Buffer.from(this.credentialId, 'base64url').length),
      Buffer.from(this.credentialId, 'base64url'),
      this.coseKey(),
    ]);
    const attestationObject = Buffer.from(
      isoCBOR.encode(
        new Map<string, CBORType>([
          ['fmt', 'none'],
          ['attStmt', new Map()],
          ['authData', new Uint8Array(authData)],
        ]),
      ),
    );
    return {
      id: this.credentialId,
      rawId: this.credentialId,
      type: 'public-key',
      response: {
        clientDataJSON: clientDataJSON.toString('base64url'),
        attestationObject: attestationObject.toString('base64url'),
        transports: ['internal', 'hybrid'],
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }

  /** AuthenticationResponseJSON for [options] (PublicKeyCredentialRequestOptionsJSON). */
  get(
    options: Record<string, unknown>,
    tweak: { withUserHandle?: boolean; userVerified?: boolean } = {},
  ): Record<string, unknown> {
    this.counter += 1;
    const uv = tweak.userVerified ?? true;
    const clientDataJSON = this.clientData(
      'webauthn.get',
      options.challenge as string,
    );
    const authData = this.authDataHead(uv ? 0x05 : 0x01);
    const signature = createSign('SHA256')
      .update(
        Buffer.concat([
          authData,
          createHash('sha256').update(clientDataJSON).digest(),
        ]),
      )
      .sign(this.privateKey);
    return {
      id: this.credentialId,
      rawId: this.credentialId,
      type: 'public-key',
      response: {
        clientDataJSON: clientDataJSON.toString('base64url'),
        authenticatorData: authData.toString('base64url'),
        signature: signature.toString('base64url'),
        userHandle:
          (tweak.withUserHandle ?? true) && this.userHandle
            ? this.userHandle.toString('base64url')
            : undefined,
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }

  private clientData(type: string, challenge: string): Buffer {
    return Buffer.from(
      JSON.stringify({
        type,
        challenge,
        origin: this.origin,
        crossOrigin: false,
      }),
      'utf8',
    );
  }

  private authDataHead(flags: number): Buffer {
    const rpIdHash = createHash('sha256').update(this.rpId).digest();
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(this.counter);
    return Buffer.concat([rpIdHash, Buffer.from([flags]), counter]);
  }

  /** COSE_Key EC2 / ES256 (RFC 9053 §7.1.1). */
  private coseKey(): Buffer {
    const jwk = this.publicKey.export({ format: 'jwk' }) as {
      x: string;
      y: string;
    };
    return Buffer.from(
      isoCBOR.encode(
        new Map<number, CBORType>([
          [1, 2], // kty: EC2
          [3, -7], // alg: ES256
          [-1, 1], // crv: P-256
          [-2, new Uint8Array(Buffer.from(jwk.x, 'base64url'))],
          [-3, new Uint8Array(Buffer.from(jwk.y, 'base64url'))],
        ]),
      ),
    );
  }
}

function uint16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
}
