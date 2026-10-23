import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { randomBytes } from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { RateLimitService } from '../services/rate-limit.service';
import { WebAuthnConfig } from './webauthn-config';

/** Which sign-in a credential serves. */
export type PasskeyScope = 'user' | 'admin';

/** A challenge waits this long for the authenticator. */
export const PASSKEY_CHALLENGE_TTL_SEC = 300;
/** Passkeys one account may hold per scope. */
export const PASSKEY_MAX_PER_SCOPE = 10;

export interface PasskeyView {
  id: string;
  name: string;
  deviceType: string;
  backedUp: boolean;
  transports: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export interface AuthenticationChallenge {
  /** Opaque id the client sends back with the assertion. */
  challengeId: string;
  /** PublicKeyCredentialRequestOptionsJSON, typed loosely for the DTO. */
  options: Record<string, unknown>;
}

export interface AuthenticatedPasskey {
  userId: string;
  credentialId: string;
  name: string;
}

/**
 * Owner 2026-10-22 (systems checklist §1): WebAuthn passkeys on
 * @simplewebauthn/server. One service for both scopes:
 *   - `user`: the app signs in with a passkey (discoverable credential,
 *     no identifier typed) and confirms sensitive actions (reauth);
 *   - `admin`: the panel's second factor next to the authenticator code
 *     (recovery codes stay valid) and its step-up.
 * Challenges live in Redis for 5 minutes, single use; the RP ID and the
 * accepted origins come from WebAuthnConfig (never from the request). The
 * signature counter is checked and stored (a cloned authenticator fails).
 * Attestation is `none`: we trust the platform, not a vendor chain.
 */
@Injectable()
export class PasskeyService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly rp: WebAuthnConfig,
    private readonly rateLimit: RateLimitService,
  ) {}

  // ---- enrolment --------------------------------------------------------

  async registrationOptions(
    userId: string,
    scope: PasskeyScope,
    account: { userName: string; displayName: string },
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const rp = await this.rp.relyingParty();
    const existing = await this.prisma.webauthnCredential.findMany({
      where: { user_id: userId, scope },
      select: { credential_id: true, transports: true },
    });
    if (existing.length >= PASSKEY_MAX_PER_SCOPE) {
      throw new HttpException(
        {
          code: ErrorCode.PASSKEY_LIMIT,
          message: `At most ${PASSKEY_MAX_PER_SCOPE} passkeys.`,
        },
        HttpStatus.CONFLICT,
      );
    }
    const options = await generateRegistrationOptions({
      rpName: rp.rpName,
      rpID: rp.rpId,
      userName: account.userName,
      userDisplayName: account.displayName,
      // The WebAuthn user handle: stable, opaque, never the e-mail.
      userID: Buffer.from(`${scope}:${userId}`, 'utf8'),
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({
        id: c.credential_id,
        transports: c.transports,
      })),
      authenticatorSelection: {
        residentKey: scope === 'user' ? 'required' : 'preferred',
        userVerification: 'preferred',
      },
      timeout: PASSKEY_CHALLENGE_TTL_SEC * 1000,
    });
    await this.redis.set(
      this.regKey(scope, userId),
      options.challenge,
      'EX',
      PASSKEY_CHALLENGE_TTL_SEC,
    );
    return options;
  }

  async verifyRegistration(
    userId: string,
    scope: PasskeyScope,
    response: RegistrationResponseJSON,
    name: string | undefined,
  ): Promise<PasskeyView> {
    const rp = await this.rp.relyingParty();
    const challenge = await this.redis.getdel(this.regKey(scope, userId));
    if (!challenge) throw passkeyInvalid('The registration timed out.');
    let verified;
    try {
      verified = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: this.expectedOrigin(
          rp,
          response.response.clientDataJSON,
        ),
        expectedRPID: rp.rpId,
        requireUserVerification: false,
      });
    } catch (err) {
      throw passkeyInvalid((err as Error).message);
    }
    if (!verified.verified) throw passkeyInvalid('Not verified.');
    const info = verified.registrationInfo;
    const row = await this.prisma.webauthnCredential.create({
      data: {
        user_id: userId,
        scope,
        credential_id: info.credential.id,
        public_key: Buffer.from(info.credential.publicKey),
        counter: BigInt(info.credential.counter),
        transports: info.credential.transports ?? [],
        device_type: info.credentialDeviceType,
        backed_up: info.credentialBackedUp,
        aaguid:
          info.aaguid === '00000000-0000-0000-0000-000000000000'
            ? null
            : info.aaguid,
        name: cleanName(name) ?? defaultName(info.credentialDeviceType),
      },
    });
    return view(row);
  }

  // ---- authentication ---------------------------------------------------

  /**
   * Options for an assertion. With [userId] the list is that account's
   * credentials (second factor / step-up); without, a discoverable
   * sign-in where the authenticator picks the account.
   */
  async authenticationOptions(
    scope: PasskeyScope,
    userId: string | null,
    bind: string | null = null,
  ): Promise<AuthenticationChallenge> {
    const rp = await this.rp.relyingParty();
    const creds = userId
      ? await this.prisma.webauthnCredential.findMany({
          where: { user_id: userId, scope },
          select: { credential_id: true, transports: true },
        })
      : [];
    if (userId && creds.length === 0) {
      throw new NotFoundException({
        code: ErrorCode.PASSKEY_NOT_FOUND,
        message: 'No passkey on this account.',
      });
    }
    const options = await generateAuthenticationOptions({
      rpID: rp.rpId,
      allowCredentials: userId
        ? creds.map((c) => ({ id: c.credential_id, transports: c.transports }))
        : undefined,
      userVerification: scope === 'user' && !userId ? 'required' : 'preferred',
      timeout: PASSKEY_CHALLENGE_TTL_SEC * 1000,
    });
    const challengeId = randomBytes(16).toString('base64url');
    await this.redis.set(
      this.authKey(scope, challengeId),
      JSON.stringify({ challenge: options.challenge, userId, bind }),
      'EX',
      PASSKEY_CHALLENGE_TTL_SEC,
    );
    return {
      challengeId,
      options: options as unknown as Record<string, unknown>,
    };
  }

  /**
   * Verifies an assertion against the stored challenge. [expectUserId]
   * pins the account for second-factor flows; [bind] must equal what was
   * stored with the challenge (e.g. the admin ticket id).
   */
  async verifyAuthentication(
    scope: PasskeyScope,
    challengeId: string,
    response: AuthenticationResponseJSON,
    expect: { userId?: string | null; bind?: string | null } = {},
  ): Promise<AuthenticatedPasskey> {
    const rp = await this.rp.relyingParty();
    const raw = await this.redis.getdel(this.authKey(scope, challengeId));
    if (!raw) throw passkeyInvalid('The challenge timed out.');
    const stored = JSON.parse(raw) as {
      challenge: string;
      userId: string | null;
      bind: string | null;
    };
    if ((expect.bind ?? null) !== stored.bind)
      throw passkeyInvalid('Wrong challenge.');
    const cred = await this.prisma.webauthnCredential.findUnique({
      where: { credential_id: response.id },
    });
    if (!cred || cred.scope !== scope) throw passkeyInvalid('Unknown passkey.');
    const pinned = expect.userId ?? stored.userId;
    if (pinned && cred.user_id !== pinned)
      throw passkeyInvalid('Wrong account.');
    // A discoverable sign-in must carry the user handle we issued.
    if (!pinned) {
      const handle = response.response.userHandle
        ? Buffer.from(response.response.userHandle, 'base64url').toString(
            'utf8',
          )
        : '';
      if (handle !== `${scope}:${cred.user_id}`) {
        throw passkeyInvalid('Wrong account.');
      }
    }
    let verified;
    try {
      verified = await verifyAuthenticationResponse({
        response,
        expectedChallenge: stored.challenge,
        expectedOrigin: this.expectedOrigin(
          rp,
          response.response.clientDataJSON,
        ),
        expectedRPID: rp.rpId,
        credential: {
          id: cred.credential_id,
          publicKey: new Uint8Array(cred.public_key),
          counter: Number(cred.counter),
          transports: cred.transports,
        },
        requireUserVerification: scope === 'user' && !expect.userId,
      });
    } catch (err) {
      throw passkeyInvalid((err as Error).message);
    }
    if (!verified.verified) throw passkeyInvalid('Not verified.');
    await this.prisma.webauthnCredential.update({
      where: { id: cred.id },
      data: {
        counter: BigInt(verified.authenticationInfo.newCounter),
        backed_up: verified.authenticationInfo.credentialBackedUp,
        last_used_at: new Date(),
      },
    });
    return {
      userId: cred.user_id,
      credentialId: cred.credential_id,
      name: cred.name,
    };
  }

  // ---- management -------------------------------------------------------

  async list(userId: string, scope: PasskeyScope): Promise<PasskeyView[]> {
    const rows = await this.prisma.webauthnCredential.findMany({
      where: { user_id: userId, scope },
      orderBy: { created_at: 'asc' },
    });
    return rows.map(view);
  }

  async count(userId: string, scope: PasskeyScope): Promise<number> {
    return this.prisma.webauthnCredential.count({
      where: { user_id: userId, scope },
    });
  }

  async remove(userId: string, scope: PasskeyScope, id: string): Promise<void> {
    const { count } = await this.prisma.webauthnCredential.deleteMany({
      where: { id, user_id: userId, scope },
    });
    if (count === 0) {
      throw new NotFoundException({
        code: ErrorCode.PASSKEY_NOT_FOUND,
        message: 'No such passkey.',
      });
    }
  }

  /** Fixed-window limit shared by the public passkey routes. */
  async limit(parts: string[], perHour: number): Promise<void> {
    const r = await this.rateLimit.consumeFixedWindow(parts, perHour, 3600);
    if (!r.allowed) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many attempts. Try again later.',
          details: { retryAfterSeconds: r.retryAfterSeconds },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // ---- helpers ----------------------------------------------------------

  /** The exact origin to expect: the configured list, or in development
   * whatever localhost port the browser sits on. */
  private expectedOrigin(
    rp: Awaited<ReturnType<WebAuthnConfig['relyingParty']>>,
    clientDataJSON: string,
  ): string | string[] {
    try {
      const data = JSON.parse(
        Buffer.from(clientDataJSON, 'base64url').toString('utf8'),
      ) as { origin?: string };
      if (data.origin && this.rp.allowsOrigin(rp, data.origin)) {
        return data.origin;
      }
    } catch {
      /* the library reports the malformed clientData itself */
    }
    return rp.origins;
  }

  private regKey(scope: PasskeyScope, userId: string): string {
    return `wa:reg:${scope}:${userId}`;
  }

  private authKey(scope: PasskeyScope, challengeId: string): string {
    return `wa:auth:${scope}:${challengeId}`;
  }
}

function view(row: {
  id: string;
  name: string;
  device_type: string;
  backed_up: boolean;
  transports: string[];
  created_at: Date;
  last_used_at: Date | null;
}): PasskeyView {
  return {
    id: row.id,
    name: row.name,
    deviceType: row.device_type,
    backedUp: row.backed_up,
    transports: row.transports,
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
  };
}

function cleanName(name: string | undefined): string | null {
  const v = name?.replace(/\s+/g, ' ').trim();
  return v ? v.slice(0, 80) : null;
}

function defaultName(deviceType: string): string {
  return deviceType === 'multiDevice' ? 'Passkey' : 'Security key';
}

const passkeyInvalid = (why: string) =>
  new UnauthorizedException({
    code: ErrorCode.PASSKEY_INVALID,
    message: `The passkey could not be verified (${why}).`,
  });
