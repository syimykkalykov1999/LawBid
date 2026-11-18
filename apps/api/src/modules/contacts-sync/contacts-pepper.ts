import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';

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
export class ContactsPepper implements OnModuleInit {
  private readonly pepper: string | null;
  /** Batch 8 CS1: the pepper before a rotation (optional secret
   * CONTACTS_PEPPER_PREVIOUS): rows sealed with it are still read and
   * removed; new rows always get the current one. */
  private readonly previous: string | null;
  private readonly production: boolean;

  constructor(
    config: ConfigService,
    @Optional() logger?: PinoLogger,
    @Optional() private readonly prisma?: PrismaService,
  ) {
    const strong = (v: string | undefined) => (v && v.length >= 32 ? v : null);
    this.pepper = strong(config.get<string>('CONTACTS_PEPPER'));
    const prev = strong(config.get<string>('CONTACTS_PEPPER_PREVIOUS'));
    this.previous = this.pepper && prev !== this.pepper ? prev : null;
    this.production = config.get<string>('NODE_ENV') === 'production';
    if (!this.pepper && this.production) {
      logger?.setContext(ContactsPepper.name);
      logger?.warn(
        'CONTACTS_PEPPER is not set: phone-book hashes are stored without a pepper (docs/runbooks/DEPLOY_PROD.md, security research #5 A7)',
      );
    }
  }

  /**
   * Batch 8 CS1 (audit 2026-11-17): once peppered rows exist, a production
   * task started without the secret would silently store plain hashes and
   * never match or remove the stored ones — it refuses to start instead.
   * Before the pepper was ever used (no peppered row) it only warns, so a
   * deploy without the secret keeps working as before.
   */
  async onModuleInit(): Promise<void> {
    if (this.pepper || !this.production || !this.prisma) return;
    const sealed = await this.prisma.contactBookHash.findFirst({
      where: { peppered: true },
      select: { owner_id: true },
    });
    if (sealed) {
      throw new Error(
        'CONTACTS_PEPPER is missing but phone-book rows are sealed with it: refusing to start (contacts would silently stop matching)',
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
    if (sealed === clientHash) return [clientHash];
    return this.previous
      ? [sealed, this.sealWith(this.previous, clientHash), clientHash]
      : [sealed, clientHash];
  }

  private sealWith(pepper: string, clientHash: string): string {
    return createHmac('sha256', pepper).update(clientHash).digest('hex');
  }

  /** The Prisma filter matching any stored form of any of [clientHashes]
   * (a plain row only while it is not peppered yet). */
  where(clientHashes: string[]): {
    OR: { phone_hash: { in: string[] }; peppered?: boolean }[];
  } {
    if (!this.enabled) return { OR: [{ phone_hash: { in: clientHashes } }] };
    const prev = this.previous;
    return {
      OR: [
        {
          phone_hash: { in: clientHashes.map((h) => this.seal(h)) },
          peppered: true,
        },
        ...(prev
          ? [
              {
                phone_hash: {
                  in: clientHashes.map((h) => this.sealWith(prev, h)),
                },
                peppered: true,
              },
            ]
          : []),
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
