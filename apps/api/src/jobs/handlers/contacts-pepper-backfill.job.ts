import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { ContactsPepper } from '../../modules/contacts-sync/contacts-pepper';

/** Where «the migration is finished» is remembered: the generic checkpoint
 * table (durable, no settings key to label). */
export const CONTACTS_PEPPER_DONE_KEY = 'ops:contacts-pepper-backfill';

/** Rows re-hashed per run (every 5 minutes): ~7 M rows a day, far more
 * than the table holds; cheap on the database. */
export const CONTACTS_PEPPER_BATCH = 2000;

export interface ContactsPepperBackfillResult {
  /** Rows re-hashed this run; 0 = done (or no pepper configured). */
  rehashed: number;
  /** Rows still waiting (an estimate: whether another batch remains). */
  remaining: boolean;
  /** True when the migration is finished and this run did no work. */
  done?: boolean;
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
 *
 * Audit X-15 (2026-10-26): a finished migration must not run for ever. The
 * first run that finds no `peppered = false` row writes a «done» checkpoint;
 * later runs return at once (one cached flag per process, no query). A new
 * database with old rows is handled by `run({ force: true })`, which ignores
 * the checkpoint and clears it when it finds work.
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

  private doneCached = false;

  private async isDone(): Promise<boolean> {
    if (this.doneCached) return true;
    try {
      const row = await this.prisma.searchIndexState.findUnique({
        where: { key: CONTACTS_PEPPER_DONE_KEY },
      });
      this.doneCached = row !== null;
    } catch {
      // No answer: do the (cheap) check below instead of stopping for good.
    }
    return this.doneCached;
  }

  private async markDone(): Promise<void> {
    this.doneCached = true;
    const value = { done: true, at: new Date().toISOString() };
    try {
      await this.prisma.searchIndexState.upsert({
        where: { key: CONTACTS_PEPPER_DONE_KEY },
        create: { key: CONTACTS_PEPPER_DONE_KEY, value },
        update: { value },
      });
      this.logger.info({}, 'contacts pepper backfill finished; job idles');
    } catch {
      // Kept in memory for this process; the next start looks once more.
    }
  }

  private async clearDone(): Promise<void> {
    this.doneCached = false;
    try {
      await this.prisma.searchIndexState.deleteMany({
        where: { key: CONTACTS_PEPPER_DONE_KEY },
      });
    } catch {
      // The rows are being processed anyway.
    }
  }

  async run(
    opts: { force?: boolean } = {},
  ): Promise<ContactsPepperBackfillResult> {
    if (!this.pepper.enabled) return { rehashed: 0, remaining: false };
    if (!opts.force && (await this.isDone())) {
      return { rehashed: 0, remaining: false, done: true };
    }
    const rows = await this.prisma.contactBookHash.findMany({
      where: { peppered: false },
      select: { owner_id: true, phone_hash: true, created_at: true },
      orderBy: [{ owner_id: 'asc' }, { phone_hash: 'asc' }],
      take: CONTACTS_PEPPER_BATCH,
    });
    if (rows.length === 0) {
      await this.markDone();
      return { rehashed: 0, remaining: false };
    }
    if (opts.force) await this.clearDone();
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
