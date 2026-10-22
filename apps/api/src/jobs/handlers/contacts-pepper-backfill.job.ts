import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { ContactsPepper } from '../../modules/contacts-sync/contacts-pepper';

/** Rows re-hashed per run (every 5 minutes): ~7 M rows a day, far more
 * than the table holds; cheap on the database. */
export const CONTACTS_PEPPER_BATCH = 2000;

export interface ContactsPepperBackfillResult {
  /** Rows re-hashed this run; 0 = done (or no pepper configured). */
  rehashed: number;
  /** Rows still waiting (an estimate: whether another batch remains). */
  remaining: boolean;
}

/**
 * Security research #5 (2026-10-22), A7: re-hashes the phone-book rows
 * written before CONTACTS_PEPPER existed (`peppered = false`) with the
 * pepper, in batches, resumable (each batch is its own transaction; a
 * crash leaves the rest for the next run). Until a row is done every
 * lookup reads both forms (ContactsPepper.where), so the app notices
 * nothing. A row whose peppered twin already exists (the same number
 * uploaded again after the switch) is simply dropped. Logs counts only,
 * never a hash.
 */
@Injectable()
export class ContactsPepperBackfillJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pepper: ContactsPepper,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ContactsPepperBackfillJob.name);
  }

  async run(): Promise<ContactsPepperBackfillResult> {
    if (!this.pepper.enabled) return { rehashed: 0, remaining: false };
    const rows = await this.prisma.contactBookHash.findMany({
      where: { peppered: false },
      select: { owner_id: true, phone_hash: true, created_at: true },
      orderBy: [{ owner_id: 'asc' }, { phone_hash: 'asc' }],
      take: CONTACTS_PEPPER_BATCH,
    });
    if (rows.length === 0) return { rehashed: 0, remaining: false };
    await this.prisma.$transaction([
      this.prisma.contactBookHash.deleteMany({
        where: {
          OR: rows.map((r) => ({
            owner_id: r.owner_id,
            phone_hash: r.phone_hash,
            peppered: false,
          })),
        },
      }),
      this.prisma.contactBookHash.createMany({
        data: rows.map((r) => ({
          owner_id: r.owner_id,
          phone_hash: this.pepper.seal(r.phone_hash),
          peppered: true,
          created_at: r.created_at,
        })),
        skipDuplicates: true,
      }),
    ]);
    const remaining = rows.length === CONTACTS_PEPPER_BATCH;
    this.logger.info(
      { rehashed: rows.length, remaining },
      'contacts pepper backfill',
    );
    return { rehashed: rows.length, remaining };
  }
}
