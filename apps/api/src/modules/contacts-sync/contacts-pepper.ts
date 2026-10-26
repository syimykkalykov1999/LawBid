import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';

/**
 * Security research #5 (2026-10-22), A7 — the stored phone-book hashes
 * get a server pepper. The app keeps sending plain SHA-256 of E.164
 * numbers (nothing to change on the phone), but the server stores
 * `HMAC-SHA256(CONTACTS_PEPPER, sha256)` in contact_book_hashes: a copy
 * of the table can no longer be matched against a precomputed list of
 * every phone number (10^10 SHA-256s take a laptop an afternoon). The
 * pepper lives only in the task environment (Secrets Manager), never in
 * the database.
 *
 * Without the variable (a dev machine, or prod before the owner adds the
 * secret) the hashes are stored as they come, like before. Rows written
 * before the pepper carry `peppered = false`; ContactsPepperBackfillJob
 * re-hashes them in batches and every lookup reads both forms until it
 * is done (dual read), so nothing is lost and the switch is one deploy.
 */
@Injectable()
export class ContactsPepper {
  private readonly pepper: string | null;

  constructor(config: ConfigService, @Optional() logger?: PinoLogger) {
    const raw = config.get<string>('CONTACTS_PEPPER');
    this.pepper = raw && raw.length >= 32 ? raw : null;
    if (!this.pepper && config.get<string>('NODE_ENV') === 'production') {
      logger?.setContext(ContactsPepper.name);
      logger?.warn(
        'CONTACTS_PEPPER is not set: phone-book hashes are stored without a pepper (docs/runbooks/DEPLOY_PROD.md, security research #5 A7)',
      );
    }
  }

  get enabled(): boolean {
    return this.pepper !== null;
  }

  /** The value stored for a client hash (the HMAC with the pepper, or the
   * hash itself without one). */
  seal(clientHash: string): string {
    if (!this.pepper) return clientHash;
    return createHmac('sha256', this.pepper).update(clientHash).digest('hex');
  }

  /** A row for [clientHash]. */
  row(clientHash: string): { phone_hash: string; peppered: boolean } {
    return { phone_hash: this.seal(clientHash), peppered: this.enabled };
  }

  /** Every stored form a client hash may have (dual read while the backfill
   * runs: the peppered row, and the plain one written before the pepper). */
  forms(clientHash: string): string[] {
    const sealed = this.seal(clientHash);
    return sealed === clientHash ? [clientHash] : [sealed, clientHash];
  }

  /** The Prisma filter matching any stored form of any of [clientHashes]
   * (a plain row only while it is not peppered yet). */
  where(clientHashes: string[]): {
    OR: { phone_hash: { in: string[] }; peppered?: boolean }[];
  } {
    if (!this.enabled) return { OR: [{ phone_hash: { in: clientHashes } }] };
    return {
      OR: [
        {
          phone_hash: { in: clientHashes.map((h) => this.seal(h)) },
          peppered: true,
        },
        { phone_hash: { in: clientHashes }, peppered: false },
      ],
    };
  }

  /** Maps a stored form back to the client hash it came from, for the
   * rows found with [where] over [clientHashes]. */
  unsealMap(clientHashes: string[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const h of clientHashes) {
      for (const f of this.forms(h)) map.set(f, h);
    }
    return map;
  }
}
