import { Injectable } from '@nestjs/common';
import type {
  Prisma,
  VerificationRequestStatus,
} from '../../../generated/prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { heldIds } from '../../../common/privacy/legal-hold';
import { PrismaService } from '../../../prisma/prisma.service';
import { FileReleaseService } from '../../files/files.public';

const DAY_MS = 24 * 3600 * 1000;

/** The file purposes of attorney verification pictures and documents. */
export const VERIFICATION_MEDIA_PURPOSES = [
  'verification_document',
  'verification_selfie',
] as const;

/** `moderation_auto_actions.kind` of an automatic rejection
 * (VerificationAutoDecisionService AUTO_REJECT_KIND). */
const AUTO_REJECT_KIND = 'verification_reject';

/** The appeal window of an automatic decision (AutoAppealsService
 * AUTO_APPEAL_WINDOW_DAYS, 30; a spec keeps the two equal). Until it closes
 * an automatic rejection is not final: an accepted appeal puts the request
 * back in the owner's queue and he needs the pictures. */
export const AUTO_REJECT_APPEAL_DAYS = 30;

/** Default of `verification.media.abandoned_days`: a request the attorney
 * left unfinished (draft / needs_more_info) loses its pictures after this
 * many days without activity. Persona: an inquiry link lapses after 1 day
 * by default and should be kept at no more than 15 days (Persona Help
 * Center «When does a link to an Inquiry expire?», read 2026-11-13). */
export const DEFAULT_ABANDONED_DAYS = 15;

/** Requests looked at per sweep step (the next run continues). */
const SWEEP_BATCH = 200;
/** Pages of decided requests per run (10 × 200). */
const SWEEP_PAGES = 10;

export type MediaPurgeWhy = 'decided' | 'abandoned' | 'account_deletion';

export interface MediaSweepResult {
  decided: number;
  abandoned: number;
  accountDeletion: number;
  files: number;
}

/** A file of the request that still has bytes in storage. */
const LIVE_MEDIA: Prisma.VerificationDocumentWhereInput = {
  file: {
    purged_at: null,
    purpose: { in: [...VERIFICATION_MEDIA_PURPOSES] },
  },
};

/**
 * Owner 2026-11-13 (row 52): «удаляем сразу после проверки … их фото и
 * доки». The selfie and the ID / licence pictures of an attorney
 * verification request are deleted as soon as the request is FINALLY
 * decided (Stripe Identity / Persona pattern: the images serve the check
 * only; BIPA 740 ILCS 14/15(a), Texas CUBI §503.001(c)(3): destroyed once
 * the purpose is met):
 * - approved (by a person, the registry, Persona or the automatic
 *   decision) or rejected by a person → at once (`afterDecision`, called
 *   by the services that decide);
 * - rejected automatically → once the appeal is refused or its 30-day
 *   window closed (the hourly sweep);
 * - left unfinished (draft / needs_more_info) for
 *   `verification.media.abandoned_days` (15) → the sweep;
 * - the attorney asked to delete the account → the sweep, without waiting
 *   for the 14-day grace period (the anonymization releases them again).
 * What stays is the proof without biometrics: the request (decision,
 * timestamps, reviewer, codes), the document rows (type, side, state,
 * capture report), the checks (registry verdict; the face similarity
 * number for `verification.face_match.retention_days`), the automatic
 * decision evidence. The objects go through FileReleaseService with
 * reason `released`: every size variant and AVIF twin with them, and the
 * CDN edge copy invalidated. A file under a legal hold stays.
 * Never throws from `afterDecision`: a storage error leaves the rows
 * unpurged and the sweep retries them.
 */
@Injectable()
export class VerificationMediaPurgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly release: FileReleaseService,
    private readonly settings: AppSettingsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(VerificationMediaPurgeService.name);
  }

  /** Right after a decision was written. Best effort, never throws. */
  async afterDecision(requestId: string, now = new Date()): Promise<number> {
    try {
      const req = await this.prisma.verificationRequest.findUnique({
        where: { id: requestId },
        select: { id: true, status: true, attorney_id: true },
      });
      if (!req || !(await this.isFinal(req.id, req.status, now))) return 0;
      return await this.purgeRequest(req.id, req.attorney_id, 'decided', now);
    } catch (err) {
      this.logger.error(
        { err, requestId },
        'verification images not deleted — the hourly sweep retries',
      );
      return 0;
    }
  }

  /**
   * Whether the decision of the request can no longer change: approved, a
   * person's rejection, or an automatic rejection whose appeal was refused
   * or whose appeal window closed without an appeal.
   */
  async isFinal(
    requestId: string,
    status: VerificationRequestStatus,
    now = new Date(),
  ): Promise<boolean> {
    if (status === 'approved') return true;
    if (status !== 'rejected') return false;
    // The automatic rejection still in force (an accepted appeal reversed
    // the earlier one: the later rejection is then a person's).
    const auto = await this.prisma.moderationAutoAction.findFirst({
      where: {
        kind: AUTO_REJECT_KIND,
        target_id: requestId,
        reversed_at: null,
      },
      orderBy: { created_at: 'desc' },
      select: { created_at: true, appeal_status: true },
    });
    if (!auto) return true;
    if (auto.appeal_status === 'rejected') return true;
    if (auto.appeal_status !== null) return false;
    return (
      now.getTime() - auto.created_at.getTime() >
      AUTO_REJECT_APPEAL_DAYS * DAY_MS
    );
  }

  /** Releases every verification file of the request still in storage. */
  async purgeRequest(
    requestId: string,
    attorneyId: string,
    why: MediaPurgeWhy,
    now = new Date(),
  ): Promise<number> {
    const docs = await this.prisma.verificationDocument.findMany({
      where: { request_id: requestId, ...LIVE_MEDIA },
      select: { file_id: true },
    });
    const ids = [...new Set(docs.map((d) => d.file_id))];
    if (ids.length === 0) return 0;
    // A legal hold on the attorney or on a file keeps the evidence.
    if ((await heldIds(this.prisma, 'user', [attorneyId], now)).size > 0) {
      return 0;
    }
    const heldFiles = await heldIds(this.prisma, 'file', ids, now);
    const free = ids.filter((id) => !heldFiles.has(id));
    if (free.length === 0) return 0;
    const { removedObjects } = await this.release.release(
      free,
      'released',
      now,
    );
    // Not decided (left unfinished, account being deleted): the document
    // rows go too, so the attorney who comes back is asked for new pictures
    // instead of being stuck on files that no longer exist (the submit
    // check refuses a deleted file and an answered info request may not
    // remove documents). A decided request keeps its rows as the proof.
    // An object a storage error left behind is then an unreferenced
    // released file, removed by the storage cleanup.
    if (why !== 'decided') {
      await this.prisma.verificationDocument.deleteMany({
        where: { request_id: requestId, file_id: { in: free } },
      });
    }
    // Ids and counts only: never a key, a link or a picture in the log.
    this.logger.info(
      { requestId, why, files: free.length, removedObjects },
      'verification images deleted',
    );
    return free.length;
  }

  /**
   * Hourly (`verification.media-purge`): decided requests whose pictures
   * are still stored (automatic rejections whose appeal closed, a failed
   * deletion), requests left unfinished, and accounts being deleted.
   */
  async sweep(now = new Date()): Promise<MediaSweepResult> {
    const result: MediaSweepResult = {
      decided: 0,
      abandoned: 0,
      accountDeletion: 0,
      files: 0,
    };
    const select = { id: true, status: true, attorney_id: true } as const;

    // Keyset pages by id: rejections still open to appeal stay in the set,
    // so they must never hide the requests behind them.
    let after: string | null = null;
    for (let page = 0; page < SWEEP_PAGES; page += 1) {
      const decided: {
        id: string;
        status: VerificationRequestStatus;
        attorney_id: string;
      }[] = await this.prisma.verificationRequest.findMany({
        where: {
          status: { in: ['approved', 'rejected'] },
          documents: { some: LIVE_MEDIA },
          ...(after ? { id: { gt: after } } : {}),
        },
        select,
        orderBy: { id: 'asc' },
        take: SWEEP_BATCH,
      });
      for (const r of decided) {
        if (!(await this.isFinal(r.id, r.status, now))) continue;
        const n = await this.safePurge(r, 'decided', now);
        if (n > 0) result.decided += 1;
        result.files += n;
      }
      if (decided.length < SWEEP_BATCH) break;
      after = decided[decided.length - 1].id;
    }

    const days = await this.abandonedDays();
    if (days > 0) {
      const cut = new Date(now.getTime() - days * DAY_MS);
      const abandoned = await this.prisma.verificationRequest.findMany({
        where: {
          status: { in: ['draft', 'needs_more_info'] },
          updated_at: { lt: cut },
          AND: [
            { documents: { some: LIVE_MEDIA } },
            { documents: { none: { created_at: { gte: cut } } } },
          ],
        },
        select,
        orderBy: { updated_at: 'asc' },
        take: SWEEP_BATCH,
      });
      for (const r of abandoned) {
        const n = await this.safePurge(r, 'abandoned', now);
        if (n > 0) result.abandoned += 1;
        result.files += n;
      }
    }

    const leaving = await this.prisma.verificationRequest.findMany({
      where: {
        attorney: { user: { status: 'deletion_pending' } },
        documents: { some: LIVE_MEDIA },
      },
      select,
      take: SWEEP_BATCH,
    });
    for (const r of leaving) {
      // A decided request keeps its rows as the proof (only pictures go).
      const decidedAlready = r.status === 'approved' || r.status === 'rejected';
      const n = await this.safePurge(
        r,
        decidedAlready ? 'decided' : 'account_deletion',
        now,
      );
      if (n > 0) result.accountDeletion += 1;
      result.files += n;
    }

    if (result.files > 0) {
      this.logger.info(result, 'verification images sweep');
    }
    return result;
  }

  private async safePurge(
    r: { id: string; attorney_id: string },
    why: MediaPurgeWhy,
    now: Date,
  ): Promise<number> {
    try {
      return await this.purgeRequest(r.id, r.attorney_id, why, now);
    } catch (err) {
      // One bad request never stops the others; the next run retries.
      this.logger.error(
        { err, requestId: r.id, why },
        'verification images not deleted',
      );
      return 0;
    }
  }

  private async abandonedDays(): Promise<number> {
    const raw = await this.settings
      .number('verification.media.abandoned_days')
      .catch(() => NaN);
    return Number.isFinite(raw) && raw >= 0
      ? Math.floor(raw)
      : DEFAULT_ABANDONED_DAYS;
  }
}
