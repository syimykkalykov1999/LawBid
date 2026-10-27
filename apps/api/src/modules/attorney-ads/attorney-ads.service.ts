import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AD_RULES,
  checkAdText,
  needsResultsDisclaimer,
  type AdFinding,
} from './ad-rules';
import {
  ATTORNEY_ADS_SETTINGS_KEY,
  mergeRules,
  parseAttorneyAdsSettings,
  type AttorneyAdsSettings,
  type StateAdRules,
} from './attorney-ads.settings';

const CACHE_MS = 30_000;
const YEAR_MS = 365 * 86_400_000;

export type AdKind = 'profile_bio' | 'post' | 'promotion';

export interface AdReview {
  rules: StateAdRules;
  findings: AdFinding[];
  /** block mode and at least one high-severity finding. */
  blocked: boolean;
}

/**
 * Owner 2026-10-28: attorney advertising compliance for attorney-authored
 * text. The rules follow the attorney's verified bar admissions; with
 * every state at `off` (the default) every method is a cheap no-op.
 */
@Injectable()
export class AttorneyAdsService {
  private readonly logger = new Logger(AttorneyAdsService.name);
  private cache?: { at: number; value: AttorneyAdsSettings };

  constructor(private readonly prisma: PrismaService) {}

  async settings(): Promise<AttorneyAdsSettings> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) {
      return this.cache.value;
    }
    const row = await this.prisma.appConfig.findUnique({
      where: { key: ATTORNEY_ADS_SETTINGS_KEY },
    });
    const value = parseAttorneyAdsSettings(row?.value);
    this.cache = { at: Date.now(), value };
    return value;
  }

  invalidate(): void {
    this.cache = undefined;
  }

  /** Verified bar admissions of an attorney. */
  async statesOf(attorneyId: string): Promise<string[]> {
    const rows = await this.prisma.attorneyLicense.findMany({
      where: { attorney_id: attorneyId, license_status: 'verified' },
      select: { state_code: true },
    });
    return [...new Set(rows.map((r) => r.state_code))];
  }

  async rulesOf(
    attorneyId: string,
  ): Promise<{ rules: StateAdRules; states: string[] }> {
    const [s, states] = await Promise.all([
      this.settings(),
      this.statesOf(attorneyId),
    ]);
    return { rules: mergeRules(s, states), states };
  }

  /** The checker: findings for [texts] under the attorney's rules. Pure
   * read; mode `off` returns nothing without running a pattern. */
  async review(attorneyId: string, texts: string[]): Promise<AdReview> {
    const { rules } = await this.rulesOf(attorneyId);
    if (rules.mode === 'off') return { rules, findings: [], blocked: false };
    const seen = new Set<string>();
    const findings: AdFinding[] = [];
    for (const t of texts) {
      for (const f of checkAdText(t, rules.disabledRules)) {
        if (seen.has(f.ruleId)) continue;
        seen.add(f.ruleId);
        findings.push(f);
      }
    }
    return {
      rules,
      findings,
      blocked:
        rules.mode === 'block' && findings.some((f) => f.severity === 'high'),
    };
  }

  /**
   * Called before an attorney's text is saved. block → the save is
   * refused with the findings; warn → the findings are only logged (and
   * stored with the archived copy). Never throws in mode off.
   */
  async enforce(attorneyId: string, texts: string[]): Promise<AdReview> {
    const review = await this.review(attorneyId, texts);
    if (review.blocked) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message:
          'This text makes a claim that is not allowed in attorney advertising (for example a guaranteed result). Please rephrase it.',
        details: {
          findings: review.findings
            .filter((f) => f.severity === 'high')
            .map((f) => ({
              rule: f.ruleId,
              excerpt: f.excerpt,
              message: f.messageEn,
            })),
        },
      });
    }
    if (review.findings.length > 0) {
      this.logger.warn(
        `ad text of ${attorneyId} flagged: ${review.findings.map((f) => f.ruleId).join(',')}`,
      );
    }
    return review;
  }

  /** Disclaimers the server adds to [text] of an attorney with [rules]. */
  disclaimersFor(
    text: string,
    rules: StateAdRules,
    opts: { label: boolean },
  ): string[] {
    const out: string[] = [];
    if (opts.label) out.push(rules.adLabel);
    if (rules.disclaimers && needsResultsDisclaimer(text)) {
      out.push(rules.resultsDisclaimer);
    }
    return out;
  }

  /**
   * Keeps a copy of a published ad version. Skipped when the state's
   * archive switch is off or the text did not change since the last
   * version. Never throws: the archive must not break publishing.
   */
  async archive(
    attorneyId: string,
    kind: AdKind,
    sourceId: string,
    content: string,
  ): Promise<void> {
    try {
      const { rules, states } = await this.rulesOf(attorneyId);
      if (!rules.archive || !content.trim()) return;
      const hash = createHash('sha256').update(content).digest('hex');
      const latest = await this.prisma.attorneyAdArchive.findFirst({
        where: { kind, source_id: sourceId },
        orderBy: { version: 'desc' },
        select: { version: true, content_hash: true },
      });
      if (latest?.content_hash === hash) return;
      const findings = checkAdText(content, rules.disabledRules).map(
        (f) => f.ruleId,
      );
      const labelStates = await this.prisma.state.findMany({
        where: { code: { in: states }, attorney_advertising_label: true },
        select: { code: true },
      });
      await this.prisma.attorneyAdArchive.create({
        data: {
          attorney_id: attorneyId,
          kind,
          source_id: sourceId,
          version: (latest?.version ?? 0) + 1,
          content,
          content_hash: hash,
          disclaimers: this.disclaimersFor(content, rules, {
            label: labelStates.length > 0,
          }),
          findings,
          state_codes: states,
          retain_until: new Date(Date.now() + rules.retentionYears * YEAR_MS),
        },
      });
    } catch (e) {
      // A concurrent writer took the same version: the copy exists.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        return;
      this.logger.error(`ad archive failed: ${(e as Error).message}`);
    }
  }

  /** Bid packs may be sold to this attorney (flag, default on). */
  async bidPacksAllowed(attorneyId: string): Promise<boolean> {
    return (await this.rulesOf(attorneyId)).rules.bidPacksAllowed;
  }

  /** Referral rewards may be paid to this attorney (flag, default on). */
  async referralRewardsAllowed(attorneyId: string): Promise<boolean> {
    return (await this.rulesOf(attorneyId)).rules.referralRewardsAllowed;
  }

  async assertBidPacksAllowed(attorneyId: string): Promise<void> {
    if (await this.bidPacksAllowed(attorneyId)) return;
    throw new ConflictException({
      code: ErrorCode.FEATURE_DISABLED,
      message: 'Offer packs are not available right now.',
    });
  }

  /** The rule catalogue (read-only) for the admin. */
  catalogue() {
    return AD_RULES.map((r) => ({
      id: r.id,
      severity: r.severity,
      reference: r.reference,
      messageEn: r.messageEn,
      messageRu: r.messageRu,
    }));
  }
}
