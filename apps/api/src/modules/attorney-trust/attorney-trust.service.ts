import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { BidStateMachine } from '../bids/domain/bid-state-machine';
import { CaseJournalService } from '../journal/case-journal.service';
import { NotificationsService } from '../notifications/notifications.service';
import { VERIFICATION_NOTIFICATION_KIND } from '../verification/verification.constants';
import {
  BLOCK_SOURCE,
  BarNumberBlocksService,
} from './bar-number-blocks.service';
import {
  COMPLAINT_REASONS,
  DUPLICATE_CLAIM_FLAG,
  FIRM_LINK,
  FIRM_LINK_SOURCE,
  INDIVIDUAL_BUSINESS_TYPES,
  HOLD,
  LICENSE_CONFIRMED_BY,
  NAME_CHECK,
  TRUST_ACTOR,
  TRUST_EVENT,
  TRUST_NOTIFICATION_KIND,
  type BadgeStatus,
  type FirmLinkSource,
  type HoldCode,
  type NameCheck,
  type TrustLevel,
} from './attorney-trust.constants';
import {
  checkLegalName,
  computeLevel,
  domainOf,
  domainsMatch,
  firmNamesMatch,
  identityConfirmed,
  isCleared,
  missingRequirements,
  payoutDelayFor,
  type Requirement,
  type TrustRequirements,
  registryConfirms,
  registryFirmOf,
  registryNameOf,
  stripeIdentity,
  type TrustSignals,
} from './trust-level';

type Db = PrismaService | Prisma.TransactionClient;

export interface TrustActor {
  type: (typeof TRUST_ACTOR)[keyof typeof TRUST_ACTOR];
  id?: string | null;
  /** Admin actions: the request IP, kept on the decision record. */
  ip?: string | null;
}

export interface TrustGate {
  ok: boolean;
  /** Why not: `requirements` (not cleared yet), `hold` or `suspended`. */
  reason: 'requirements' | 'hold' | 'suspended' | null;
  /** The enabled requirements still missing (owner's switches). */
  missing: Requirement[];
  current: number;
  hold: string | null;
}

/** Where the attorney stands for staff: self-declared (nothing for staff),
 * needs_staff (something waits in the queue), cleared, suspended. */
export type StaffStatus =
  'self_declared' | 'needs_staff' | 'cleared' | 'suspended';

/** Everything the API exposes about one attorney's trust. */
export interface TrustSnapshot {
  attorneyId: string;
  level: TrustLevel;
  badge: boolean;
  verificationStatus: string;
  signals: TrustSignals & {
    identityConfirmed: boolean;
    stripeIdentity: boolean;
  };
  holds: {
    payments: string | null;
    paymentsAt: Date | null;
    bids: string | null;
    bidsAt: Date | null;
    note: string | null;
  };
  gates: { bids: TrustGate; payments: TrustGate };
  /** Owner's switches and what they leave open. */
  requirements: TrustRequirements;
  missing: Requirement[];
  cleared: boolean;
  clearedBy: 'auto' | 'staff' | null;
  staffClearedAt: Date | null;
  staffClearedBy: string | null;
  staffStatus: StaffStatus;
  /** The badge as the admin manages it («Галочки → Адвокаты»). */
  badgeStatus: BadgeStatus;
  /** Why the attorney sits in the staff queue (empty when not). */
  queueReasons: string[];
  documentsRequestedAt: Date | null;
  documentsRequestedTemplate: string | null;
  payoutDelayDays: number | null;
  stripeLegalName: string | null;
  stripe: {
    businessType: string | null;
    companyName: string | null;
    companyDomain: string | null;
    representative: string | null;
  };
  firmLink: {
    status: string;
    source: string | null;
    at: Date | null;
    emailDomain: string | null;
    note: string | null;
  };
  complaintsTotal: number;
  duplicateClaims: number;
  computedAt: Date;
}

export interface StaffDecisionRow {
  adminId: string;
  cleared: number;
  uncleared: number;
  rejected: number;
  documentsRequested: number;
  released: number;
  /** Decisions that came under a minute after the previous one. */
  fastDecisions: number;
  medianSecondsBetween: number | null;
  laterComplaints: number;
  laterSuspended: number;
  firstDecisionAt: Date;
  lastDecisionAt: Date;
  gaps: number[];
}

export interface ClearedByRow {
  attorney: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    username: string;
    verificationStatus: string;
  };
  level: number;
  clearedAt: Date;
  complaintsAfter: number;
  suspendedAfter: boolean;
  documentsSeen: string[];
}

export interface StripePerson {
  firstName?: string | null;
  lastName?: string | null;
  /** representative | owner | executive | director. */
  role?: string | null;
}

/** What the payments module learned from Stripe's `account.updated`. */
export interface StripeAccountFacts {
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  /** `business_type`: individual | company | non_profit | government_entity. */
  businessType?: string | null;
  /** individual accounts: `individual.first_name` / `last_name`. */
  legalFirstName?: string | null;
  legalLastName?: string | null;
  legalName?: string | null;
  /** company accounts: `company.name`, `business_profile.url`, and the
   * representative + persons with relationship owner / executive. */
  companyName?: string | null;
  companyUrl?: string | null;
  people?: StripePerson[];
}

const SYSTEM: TrustActor = { type: TRUST_ACTOR.system };

const PROFILE_SELECT = {
  user_id: true,
  verification_status: true,
  name_mismatch: true,
  trust_level: true,
  trust_badge: true,
  user: { select: { first_name: true, last_name: true } },
  licenses: {
    select: {
      id: true,
      state_code: true,
      bar_number: true,
      license_status: true,
      registry_flag: true,
      auto_check_result: true,
    },
  },
  trust: true,
  verification_requests: {
    where: { status: { in: ['submitted', 'in_review'] } },
    select: { id: true, documents: { select: { doc_type: true } } },
    take: 1,
  },
} satisfies Prisma.AttorneyProfileSelect;

type ProfileRow = Prisma.AttorneyProfileGetPayload<{
  select: typeof PROFILE_SELECT;
}>;

/**
 * Owner 2026-10-05: attorney trust levels (docs/ATTORNEY_TRUST.md). The
 * level is derived — never set by hand — from facts recorded here (a
 * verifier's confirmation, Stripe's KYC) and in the verification module
 * (registry lookups, flags, status). Every input calls `recompute`, which
 * mirrors the level and the blue check onto attorney_profiles and writes
 * a history row when the level moves.
 */
@Injectable()
export class AttorneyTrustService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly notifications: NotificationsService,
    private readonly bidMachine: BidStateMachine,
    private readonly journal: CaseJournalService,
    private readonly blocks: BarNumberBlocksService,
    @InjectPinoLogger(AttorneyTrustService.name)
    private readonly logger: PinoLogger,
  ) {}

  // --- reads -------------------------------------------------------------

  /** The snapshot, recomputing first so it never lags the facts. */
  async snapshot(attorneyId: string): Promise<TrustSnapshot | null> {
    const row = await this.prisma.attorneyProfile.findUnique({
      where: { user_id: attorneyId },
      select: PROFILE_SELECT,
    });
    if (!row) return null;
    // Never computed yet (a fresh profile): compute and store it first so
    // the public card and the gates do not read a stale level 0.
    if (!row.trust) return this.recompute(attorneyId);
    return this.snapshotOf(row);
  }

  /** May this attorney place bids / accept invites right now? */
  async bidGate(attorneyId: string): Promise<TrustGate> {
    const snap = await this.snapshot(attorneyId);
    return snap?.gates.bids ?? closed('suspended', [], 0);
  }

  /** May this attorney receive client money / send invoices? Payments
   * (PR #48) call this next to the plan entitlement. */
  async paymentsGate(attorneyId: string): Promise<TrustGate> {
    const snap = await this.snapshot(attorneyId);
    return snap?.gates.payments ?? closed('suspended', [], 0);
  }

  async assertCanBid(attorneyId: string): Promise<void> {
    throwIfClosed(await this.bidGate(attorneyId), 'bids');
  }

  async assertCanAcceptPayments(attorneyId: string): Promise<void> {
    throwIfClosed(await this.paymentsGate(attorneyId), 'payments');
  }

  /** The payout delay (days) Stripe should apply to this attorney's
   * connected account; null = Stripe's default. */
  async desiredPayoutDelayDays(attorneyId: string): Promise<number | null> {
    const snap = await this.snapshot(attorneyId);
    return snap?.payoutDelayDays ?? null;
  }

  /** Levels (and badge flag) of several attorneys for list DTOs. */
  async levelsOf(
    attorneyIds: readonly string[],
  ): Promise<Map<string, { level: number; badge: boolean }>> {
    if (attorneyIds.length === 0) return new Map();
    const rows = await this.prisma.attorneyProfile.findMany({
      where: { user_id: { in: [...attorneyIds] } },
      select: { user_id: true, trust_level: true, trust_badge: true },
    });
    return new Map(
      rows.map((r) => [
        r.user_id,
        { level: r.trust_level, badge: r.trust_badge },
      ]),
    );
  }

  // --- recompute ---------------------------------------------------------

  /**
   * Re-derives the level and badge from the current facts. Writes only
   * when something changed; a level change leaves an event and tells the
   * attorney when it went up. Safe to call often.
   */
  async recompute(
    attorneyId: string,
    actor: TrustActor = SYSTEM,
    tx?: Prisma.TransactionClient,
  ): Promise<TrustSnapshot | null> {
    const run = async (db: Prisma.TransactionClient) => {
      const row = await db.attorneyProfile.findUnique({
        where: { user_id: attorneyId },
        select: PROFILE_SELECT,
      });
      if (!row) return null;
      const trust = row.trust ?? (await this.ensureRow(db, attorneyId));
      const signals = this.signalsOf({ ...row, trust });
      const level = computeLevel(signals);
      const requirements = await this.requirements();
      const badge =
        row.verification_status === 'verified' &&
        !row.name_mismatch &&
        isCleared(signals, requirements, trust.staff_cleared_at !== null);
      const now = new Date();
      if (
        level !== row.trust_level ||
        badge !== row.trust_badge ||
        level !== trust.level
      ) {
        await db.attorneyProfile.update({
          where: { user_id: attorneyId },
          data: { trust_level: level, trust_badge: badge },
        });
        await db.attorneyTrust.update({
          where: { attorney_id: attorneyId },
          data: { level, computed_at: now },
        });
        if (level !== row.trust_level) {
          await this.event(db, attorneyId, TRUST_EVENT.levelChanged, actor, {
            fromLevel: row.trust_level,
            toLevel: level,
            signals: signals as unknown as Prisma.InputJsonObject,
          });
          if (level > row.trust_level) {
            await this.notify(db, attorneyId, TRUST_NOTIFICATION_KIND.levelUp, {
              level,
            });
          }
        }
      } else if (
        trust.computed_at.getTime() <
        now.getTime() - 24 * 3600 * 1000
      ) {
        await db.attorneyTrust.update({
          where: { attorney_id: attorneyId },
          data: { computed_at: now },
        });
      }
      return this.snapshotOf(
        {
          ...row,
          trust_level: level,
          trust_badge: badge,
          trust: { ...trust, level, computed_at: now },
        },
        signals,
      );
    };
    return tx ? run(tx) : withTxRetry(this.prisma, run);
  }

  /** The rule-change notice was already sent in the last 10 minutes (a
   * settings save and a preset both recompute everyone). */
  private async recentlyToldRequirements(attorneyId: string): Promise<boolean> {
    const since = new Date(Date.now() - 10 * 60 * 1000);
    const row = await this.prisma.notification.findFirst({
      where: {
        user_id: attorneyId,
        type: 'verification_update',
        created_at: { gte: since },
        payload: {
          path: ['kind'],
          equals: TRUST_NOTIFICATION_KIND.requirementsChanged,
        },
      },
      select: { id: true },
    });
    return row !== null;
  }

  /** Nightly safety net and the admin's "recompute everyone". */
  async recomputeAll(
    batch = 200,
    opts: { notifyNewlyRequired?: boolean } = {},
  ): Promise<{ attorneys: number; changed: number }> {
    let cursor: string | undefined;
    let attorneys = 0;
    let changed = 0;
    for (;;) {
      const rows = await this.prisma.attorneyProfile.findMany({
        select: { user_id: true, trust_level: true, trust_badge: true },
        orderBy: { user_id: 'asc' },
        take: batch,
        ...(cursor ? { cursor: { user_id: cursor }, skip: 1 } : {}),
      });
      if (rows.length === 0) break;
      for (const r of rows) {
        attorneys += 1;
        const snap = await this.recompute(r.user_id);
        if (
          snap &&
          (snap.level !== r.trust_level || snap.badge !== r.trust_badge)
        ) {
          changed += 1;
          // Owner 2026-10-05 06:07: the rules got stricter and this attorney
          // lost the badge — tell them what is required now.
          if (
            opts.notifyNewlyRequired &&
            r.trust_badge &&
            !snap.badge &&
            snap.missing.length > 0 &&
            !(await this.recentlyToldRequirements(r.user_id))
          ) {
            await this.notifications.emit({
              type: 'verification_update',
              recipientId: r.user_id,
              payload: {
                kind: TRUST_NOTIFICATION_KIND.requirementsChanged,
                missing: snap.missing,
              },
            });
          }
        }
      }
      cursor = rows[rows.length - 1].user_id;
      if (rows.length < batch) break;
    }
    return { attorneys, changed };
  }

  // --- inputs ------------------------------------------------------------

  /** A verifier confirmed the license on the state bar's own page. */
  async confirmLicenseByStaff(
    attorneyId: string,
    actor: TrustActor,
    note: string | null,
  ): Promise<TrustSnapshot | null> {
    return withTxRetry(this.prisma, async (tx) => {
      await this.ensureRow(tx, attorneyId);
      const now = new Date();
      await tx.attorneyTrust.update({
        where: { attorney_id: attorneyId },
        data: {
          license_confirmed_at: now,
          license_confirmed_by: LICENSE_CONFIRMED_BY.staff,
          license_confirmed_note: note,
        },
      });
      await this.event(tx, attorneyId, TRUST_EVENT.licenseConfirmed, actor, {
        by: LICENSE_CONFIRMED_BY.staff,
        note,
      });
      return this.recompute(attorneyId, actor, tx);
    });
  }

  /** Withdraws a staff confirmation (the registry's own verdict stays). */
  async unconfirmLicense(
    attorneyId: string,
    actor: TrustActor,
    note: string | null,
  ): Promise<TrustSnapshot | null> {
    return withTxRetry(this.prisma, async (tx) => {
      await this.ensureRow(tx, attorneyId);
      await tx.attorneyTrust.update({
        where: { attorney_id: attorneyId },
        data: {
          license_confirmed_at: null,
          license_confirmed_by: null,
          license_confirmed_note: note,
        },
      });
      await this.event(tx, attorneyId, TRUST_EVENT.licenseUnconfirmed, actor, {
        note,
      });
      return this.recompute(attorneyId, actor, tx);
    });
  }

  /** A verifier checked bar card + ID + selfie (from the admin button or
   * when a request with identity documents is approved by hand). */
  async confirmDocuments(
    attorneyId: string,
    actor: TrustActor,
    note: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<TrustSnapshot | null> {
    const run = async (db: Prisma.TransactionClient) => {
      await this.ensureRow(db, attorneyId);
      await db.attorneyTrust.update({
        where: { attorney_id: attorneyId },
        data: {
          documents_verified_at: new Date(),
          documents_verified_by: actor.id ?? null,
        },
      });
      await this.event(db, attorneyId, TRUST_EVENT.documentsVerified, actor, {
        note,
      });
      // Documents answer a name mismatch: the hold it caused is lifted.
      await this.releaseIfHeldFor(db, attorneyId, HOLD.nameMismatch, actor);
      return this.recompute(attorneyId, actor, db);
    };
    return tx ? run(tx) : withTxRetry(this.prisma, run);
  }

  /**
   * Stripe Connect `account.updated` (payments module): KYC state and who
   * Stripe verified. An individual account compares its legal name; a
   * company account compares the representative and the owners /
   * executives (owner 2026-10-05: "LLC, not my name") — never the company
   * name. No match on an individual account pauses payments (when
   * `trust.auto_hold_on_name_mismatch`) and asks for documents; no match
   * on a company account asks the attorney to show the link to the firm
   * (registry firm, firm e-mail, or a verifier).
   */
  async onStripeAccount(
    attorneyId: string,
    facts: StripeAccountFacts,
  ): Promise<TrustSnapshot | null> {
    return withTxRetry(this.prisma, async (tx) => {
      const row = await tx.attorneyProfile.findUnique({
        where: { user_id: attorneyId },
        select: PROFILE_SELECT,
      });
      if (!row) return null;
      const trust = row.trust ?? (await this.ensureRow(tx, attorneyId));
      const kyc = facts.chargesEnabled && facts.detailsSubmitted;
      const businessType = (facts.businessType ?? '').trim() || null;
      const isCompany =
        businessType !== null &&
        !(INDIVIDUAL_BUSINESS_TYPES as readonly string[]).includes(
          businessType,
        );
      const profile = {
        firstName: row.user.first_name,
        lastName: row.user.last_name,
      };
      const registryName = registryNameOf(row.licenses);
      let nameCheck: NameCheck = NAME_CHECK.unknown;
      let legalName: string | null = null;
      let representative: string | null = null;
      if (!isCompany) {
        legalName =
          (facts.legalName ?? '').trim() ||
          joinName(facts.legalFirstName, facts.legalLastName);
        nameCheck = checkLegalName(
          {
            firstName: facts.legalFirstName,
            lastName: facts.legalLastName,
            full: facts.legalName,
          },
          profile,
          registryName,
        );
      } else {
        legalName = (facts.companyName ?? '').trim() || null;
        const people = facts.people ?? [];
        for (const person of people) {
          const check = checkLegalName(person, profile, registryName);
          if (check === NAME_CHECK.match) {
            nameCheck = NAME_CHECK.match;
            representative = joinName(person.firstName, person.lastName);
            break;
          }
          if (check === NAME_CHECK.mismatch) nameCheck = NAME_CHECK.mismatch;
        }
        if (representative === null) {
          const rep =
            people.find((p) => p.role === 'representative') ?? people[0];
          representative = rep ? joinName(rep.firstName, rep.lastName) : null;
        }
      }
      const companyDomain = isCompany ? domainOf(facts.companyUrl) : null;
      const now = new Date();
      const actor: TrustActor = { type: TRUST_ACTOR.stripe };
      await tx.attorneyTrust.update({
        where: { attorney_id: attorneyId },
        data: {
          stripe_kyc_at: kyc ? (trust.stripe_kyc_at ?? now) : null,
          stripe_charges_enabled: facts.chargesEnabled,
          stripe_legal_name: legalName,
          stripe_business_type: businessType,
          stripe_company_name: isCompany ? legalName : null,
          stripe_company_domain: companyDomain,
          stripe_representative: representative,
          name_check: nameCheck,
          name_checked_at: now,
        },
      });
      if (kyc && !trust.stripe_kyc_at) {
        await this.event(tx, attorneyId, TRUST_EVENT.stripeKyc, actor, {
          businessType,
          legalName,
          representative,
        });
      }
      if (nameCheck !== trust.name_check) {
        await this.event(tx, attorneyId, TRUST_EVENT.nameCheck, actor, {
          result: nameCheck,
          businessType,
          legalName,
          representative,
          profileName: joinName(row.user.first_name, row.user.last_name),
          registryName,
        });
      }
      if (isCompany && nameCheck !== NAME_CHECK.match) {
        // The firm's account: show the link to the firm. Automatically
        // when the registry's firm or a confirmed firm e-mail agrees.
        const linked = await this.tryAutoFirmLink(
          tx,
          attorneyId,
          {
            ...trust,
            stripe_company_name: legalName,
            stripe_company_domain: companyDomain,
          },
          registryFirmOf(row.licenses),
          actor,
        );
        if (!linked && trust.firm_link_status === FIRM_LINK.none) {
          await tx.attorneyTrust.update({
            where: { attorney_id: attorneyId },
            data: { firm_link_status: FIRM_LINK.pending },
          });
          await this.notify(
            tx,
            attorneyId,
            TRUST_NOTIFICATION_KIND.firmLinkRequired,
            { companyName: legalName },
          );
        }
      } else if (
        !isCompany &&
        nameCheck === NAME_CHECK.mismatch &&
        !trust.documents_verified_at &&
        (await this.on('trust.auto_hold_on_name_mismatch'))
      ) {
        await this.holdInTx(
          tx,
          attorneyId,
          { payments: true, bids: false, code: HOLD.nameMismatch, note: null },
          actor,
          TRUST_NOTIFICATION_KIND.documentsRequested,
        );
      } else if (nameCheck === NAME_CHECK.match) {
        await this.releaseIfHeldFor(tx, attorneyId, HOLD.nameMismatch, actor);
      }
      return this.recompute(attorneyId, actor, tx);
    });
  }

  /**
   * The attorney confirmed an e-mail address on a domain (TrustFirmEmail
   * flow). Stored; counts as the firm link when the Stripe company's
   * website is on that domain (`trust.firm_link_auto_email`).
   */
  async onFirmEmailConfirmed(
    attorneyId: string,
    emailDomain: string,
  ): Promise<TrustSnapshot | null> {
    const actor: TrustActor = { type: TRUST_ACTOR.attorney, id: attorneyId };
    return withTxRetry(this.prisma, async (tx) => {
      const trust = await this.ensureRow(tx, attorneyId);
      const now = new Date();
      await tx.attorneyTrust.update({
        where: { attorney_id: attorneyId },
        data: { firm_email_domain: emailDomain, firm_email_verified_at: now },
      });
      await this.event(tx, attorneyId, TRUST_EVENT.firmEmail, actor, {
        domain: emailDomain,
      });
      const row = await tx.attorneyProfile.findUnique({
        where: { user_id: attorneyId },
        select: PROFILE_SELECT,
      });
      await this.tryAutoFirmLink(
        tx,
        attorneyId,
        {
          ...trust,
          firm_email_domain: emailDomain,
          firm_email_verified_at: now,
        },
        row ? registryFirmOf(row.licenses) : null,
        actor,
      );
      return this.recompute(attorneyId, actor, tx);
    });
  }

  /** A verifier saw the letter on the firm's letterhead (+ bar card + ID). */
  async confirmFirmLink(
    attorneyId: string,
    actor: TrustActor,
    note: string | null,
  ): Promise<TrustSnapshot | null> {
    return withTxRetry(this.prisma, async (tx) => {
      await this.ensureRow(tx, attorneyId);
      await this.setFirmLink(
        tx,
        attorneyId,
        FIRM_LINK_SOURCE.staff,
        actor,
        note,
      );
      return this.recompute(attorneyId, actor, tx);
    });
  }

  /** Registry firm = Stripe company, or firm e-mail domain = Stripe
   * company website: the link is confirmed without a person. */
  private async tryAutoFirmLink(
    tx: Prisma.TransactionClient,
    attorneyId: string,
    trust: {
      firm_link_status: string;
      stripe_company_name: string | null;
      stripe_company_domain: string | null;
      firm_email_domain: string | null;
      firm_email_verified_at: Date | null;
    },
    registryFirm: string | null,
    actor: TrustActor,
  ): Promise<boolean> {
    if (trust.firm_link_status === FIRM_LINK.confirmed) return true;
    if (
      (await this.settings.boolean('trust.firm_link_auto_registry')) &&
      firmNamesMatch(registryFirm, trust.stripe_company_name)
    ) {
      await this.setFirmLink(
        tx,
        attorneyId,
        FIRM_LINK_SOURCE.registry,
        actor,
        registryFirm,
      );
      return true;
    }
    if (
      (await this.settings.boolean('trust.firm_link_auto_email')) &&
      trust.firm_email_verified_at &&
      domainsMatch(trust.firm_email_domain, trust.stripe_company_domain)
    ) {
      await this.setFirmLink(
        tx,
        attorneyId,
        FIRM_LINK_SOURCE.email,
        actor,
        trust.firm_email_domain,
      );
      return true;
    }
    return false;
  }

  private async setFirmLink(
    tx: Prisma.TransactionClient,
    attorneyId: string,
    source: FirmLinkSource,
    actor: TrustActor,
    note: string | null,
  ): Promise<void> {
    await tx.attorneyTrust.update({
      where: { attorney_id: attorneyId },
      data: {
        firm_link_status: FIRM_LINK.confirmed,
        firm_link_source: source,
        firm_link_at: new Date(),
        firm_link_note: note,
      },
    });
    await this.event(tx, attorneyId, TRUST_EVENT.firmLink, actor, {
      source,
      note,
    });
    await this.notify(
      tx,
      attorneyId,
      TRUST_NOTIFICATION_KIND.firmLinkConfirmed,
      {
        source,
      },
    );
  }

  /** Records that Stripe was asked for [days] of payout delay. */
  async markPayoutDelaySynced(
    attorneyId: string,
    days: number | null,
  ): Promise<void> {
    await this.ensureRow(this.prisma, attorneyId);
    await this.prisma.attorneyTrust.update({
      where: { attorney_id: attorneyId },
      data: { payout_delay_days: days, payout_delay_synced_at: new Date() },
    });
    await this.event(this.prisma, attorneyId, TRUST_EVENT.payoutDelay, SYSTEM, {
      days,
    });
  }

  /**
   * A client reported the attorney for fraud / impersonation (POST
   * /reports). Counts only when the two really dealt with each other (a
   * bid on the client's case or a chat), so a stranger cannot freeze a
   * lawyer. With `trust.auto_hold_on_complaint` payments and new bids
   * pause until a verifier looks; `trust.complaints_to_suspend` distinct
   * clients within the window suspend the profile.
   */
  async onComplaint(
    reporterId: string,
    attorneyId: string,
    reason: string,
  ): Promise<void> {
    if (!(COMPLAINT_REASONS as readonly string[]).includes(reason)) return;
    const profile = await this.prisma.attorneyProfile.findUnique({
      where: { user_id: attorneyId },
      select: { user_id: true, verification_status: true },
    });
    if (!profile) return;
    if (!(await this.dealtWith(reporterId, attorneyId))) {
      this.logger.info(
        { reporterId, attorneyId },
        'Trust complaint ignored: no case or chat between the two',
      );
      return;
    }
    const [autoHold, toSuspend, windowDays] = await Promise.all([
      this.on('trust.auto_hold_on_complaint'),
      this.settings.number('trust.complaints_to_suspend'),
      this.settings.number('trust.complaint_window_days'),
    ]);
    const since = new Date(Date.now() - windowDays * 24 * 3600 * 1000);
    const reporters = await this.prisma.report.findMany({
      where: {
        target_type: 'user',
        target_id: attorneyId,
        reason: { in: [...COMPLAINT_REASONS] },
        created_at: { gte: since },
      },
      select: { reporter_id: true },
      distinct: ['reporter_id'],
    });
    // Only complaints from people who really dealt with the attorney count
    // towards suspension (a stranger's report is recorded but ignored).
    const distinct = new Set<string>([reporterId]);
    for (const r of reporters) {
      if (distinct.has(r.reporter_id)) continue;
      if (await this.dealtWith(r.reporter_id, attorneyId)) {
        distinct.add(r.reporter_id);
      }
    }
    const actor: TrustActor = { type: TRUST_ACTOR.client, id: reporterId };
    await withTxRetry(this.prisma, async (tx) => {
      await this.ensureRow(tx, attorneyId);
      await tx.attorneyTrust.update({
        where: { attorney_id: attorneyId },
        data: { complaints_total: { increment: 1 } },
      });
      await this.event(tx, attorneyId, TRUST_EVENT.complaint, actor, {
        reason,
        distinctReporters: distinct.size,
      });
      if (autoHold) {
        await this.holdInTx(
          tx,
          attorneyId,
          { payments: true, bids: true, code: HOLD.complaint, note: null },
          actor,
          TRUST_NOTIFICATION_KIND.paymentsPaused,
        );
      }
      if (
        distinct.size >= toSuspend &&
        profile.verification_status !== 'suspended'
      ) {
        await this.autoSuspend(tx, attorneyId, actor, {
          reason,
          distinctReporters: distinct.size,
        });
      }
      await this.recompute(attorneyId, actor, tx);
    });
  }

  /**
   * Someone tried to register a (state, bar number) another account holds
   * (LICENSE_ALREADY_REGISTERED). Both sides are recorded; the holder's
   * license is flagged for the registry queue so a verifier decides who
   * the real holder is. Nobody is punished automatically.
   */
  async onDuplicateClaim(
    holderId: string,
    claimantId: string,
    stateCode: string,
    barNumber: string,
  ): Promise<void> {
    if (!(await this.on('trust.flag_duplicate_claims'))) return;
    const actor: TrustActor = { type: TRUST_ACTOR.attorney, id: claimantId };
    await withTxRetry(this.prisma, async (tx) => {
      await this.ensureRow(tx, holderId);
      await tx.attorneyTrust.update({
        where: { attorney_id: holderId },
        data: { duplicate_claims: { increment: 1 } },
      });
      await tx.attorneyLicense.updateMany({
        where: {
          attorney_id: holderId,
          state_code: stateCode,
          bar_number: barNumber,
          registry_flag: null,
        },
        data: {
          registry_flag: DUPLICATE_CLAIM_FLAG,
          registry_flagged_at: new Date(),
        },
      });
      await this.event(tx, holderId, TRUST_EVENT.duplicateClaim, actor, {
        stateCode,
        claimantId,
      });
      const claimant = await tx.attorneyProfile.findUnique({
        where: { user_id: claimantId },
        select: { user_id: true },
      });
      if (claimant) {
        await this.ensureRow(tx, claimantId);
        await this.event(
          tx,
          claimantId,
          TRUST_EVENT.duplicateClaimMade,
          actor,
          {
            stateCode,
            holderId,
          },
        );
      }
      await this.recompute(holderId, actor, tx);
    });
  }

  /** Admin: pause payments and/or bids. */
  async hold(
    attorneyId: string,
    input: { payments: boolean; bids: boolean; note: string | null },
    actor: TrustActor,
  ): Promise<TrustSnapshot | null> {
    return withTxRetry(this.prisma, async (tx) => {
      await this.ensureRow(tx, attorneyId);
      await this.holdInTx(
        tx,
        attorneyId,
        { ...input, code: HOLD.admin },
        actor,
        input.payments
          ? TRUST_NOTIFICATION_KIND.paymentsPaused
          : TRUST_NOTIFICATION_KIND.bidsPaused,
      );
      return this.recompute(attorneyId, actor, tx);
    });
  }

  /** Admin: lift holds (a verifier looked and found nothing). */
  async release(
    attorneyId: string,
    input: { payments: boolean; bids: boolean; note: string | null },
    actor: TrustActor,
  ): Promise<TrustSnapshot | null> {
    return withTxRetry(this.prisma, async (tx) => {
      const trust = await this.ensureRow(tx, attorneyId);
      const data: Prisma.AttorneyTrustUpdateInput = {};
      if (input.payments && trust.payments_hold) {
        data.payments_hold = null;
        data.payments_hold_at = null;
      }
      if (input.bids && trust.bids_hold) {
        data.bids_hold = null;
        data.bids_hold_at = null;
      }
      if (Object.keys(data).length === 0)
        return this.recompute(attorneyId, actor, tx);
      data.hold_note = input.note;
      await tx.attorneyTrust.update({
        where: { attorney_id: attorneyId },
        data,
      });
      await this.event(tx, attorneyId, TRUST_EVENT.release, actor, {
        payments: input.payments && !!trust.payments_hold,
        bids: input.bids && !!trust.bids_hold,
        note: input.note,
      });
      await this.notify(
        tx,
        attorneyId,
        input.payments && trust.payments_hold
          ? TRUST_NOTIFICATION_KIND.paymentsResumed
          : TRUST_NOTIFICATION_KIND.holdLifted,
        {},
      );
      return this.recompute(attorneyId, actor, tx);
    });
  }

  /** History for the admin card, newest first. */
  async events(attorneyId: string, limit = 50) {
    return this.prisma.attorneyTrustEvent.findMany({
      where: { attorney_id: attorneyId },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }

  // --- staff («Борьба с мошенниками») -----------------------------------

  /** The owner's switches: what an attorney must pass. With the master
   * switch off nothing is required; with staff review off the documents
   * requirement (staff-only) is ignored. */
  async requirements(): Promise<TrustRequirements> {
    const [enabled, manualReview, registry, identity, documents] =
      await Promise.all([
        this.settings.boolean('trust.enabled'),
        this.settings.boolean('trust.manual_review'),
        this.settings.boolean('trust.require_registry'),
        this.settings.boolean('trust.require_identity'),
        this.settings.boolean('trust.require_documents'),
      ]);
    if (!enabled) return { registry: false, identity: false, documents: false };
    return { registry, identity, documents: documents && manualReview };
  }

  /** The master switch and staff review («Выключить всё» / «Включить всё»). */
  async rules(): Promise<{ enabled: boolean; manualReview: boolean }> {
    const [enabled, manualReview] = await Promise.all([
      this.settings.boolean('trust.enabled'),
      this.settings.boolean('trust.manual_review'),
    ]);
    return { enabled, manualReview };
  }

  /** A `trust.*` switch that only counts while the master switch is on. */
  private async on(
    key:
      | 'trust.auto_hold_on_complaint'
      | 'trust.auto_hold_on_name_mismatch'
      | 'trust.flag_duplicate_claims',
  ): Promise<boolean> {
    const [enabled, value] = await Promise.all([
      this.settings.boolean('trust.enabled'),
      this.settings.boolean(key),
    ]);
    return enabled && value;
  }

  /**
   * «Подтвердить»: a verifier looked at everything the rules ask for and
   * vouches for the attorney. Opens the badge and payments for good; lifts
   * review holds (not a complaint hold, which has its own release) and
   * marks the documents checked when the request carried an ID.
   */
  async clearByStaff(
    attorneyId: string,
    actor: TrustActor,
    note: string | null,
    opts: { tx?: Prisma.TransactionClient; notify?: boolean } = {},
  ): Promise<TrustSnapshot | null> {
    const run = async (tx: Prisma.TransactionClient) => {
      const trust = await this.ensureRow(tx, attorneyId);
      const seen = await this.decisionContext(tx, attorneyId, trust);
      const now = new Date();
      await tx.attorneyTrust.update({
        where: { attorney_id: attorneyId },
        data: {
          staff_cleared_at: now,
          staff_cleared_by: actor.id ?? null,
          staff_cleared_note: note,
          documents_verified_at: trust.documents_verified_at ?? now,
          documents_verified_by:
            trust.documents_verified_by ?? actor.id ?? null,
          ...(trust.firm_link_status === FIRM_LINK.pending
            ? {
                firm_link_status: FIRM_LINK.confirmed,
                firm_link_source: FIRM_LINK_SOURCE.staff,
                firm_link_at: now,
                firm_link_note: note,
              }
            : {}),
        },
      });
      // Owner 2026-10-05: the decision record — who, when, from where, what
      // they saw — stays forever (no API deletes trust events).
      await this.event(tx, attorneyId, TRUST_EVENT.staffCleared, actor, {
        note,
        ...seen,
      });
      await this.releaseIfHeldFor(tx, attorneyId, HOLD.nameMismatch, actor);
      await this.releaseIfHeldFor(tx, attorneyId, HOLD.duplicateClaim, actor);
      // A registry difference staff looked at no longer blocks.
      await tx.attorneyLicense.updateMany({
        where: { attorney_id: attorneyId, registry_flag: { not: null } },
        data: { registry_flag: null, registry_flagged_at: null },
      });
      if (opts.notify !== false) {
        await this.notify(tx, attorneyId, TRUST_NOTIFICATION_KIND.cleared, {});
      }
      return this.recompute(attorneyId, actor, tx);
    };
    return opts.tx ? run(opts.tx) : withTxRetry(this.prisma, run);
  }

  /** Withdraw a staff clearance (it was a mistake). */
  async unclearByStaff(
    attorneyId: string,
    actor: TrustActor,
    note: string | null,
  ): Promise<TrustSnapshot | null> {
    return withTxRetry(this.prisma, async (tx) => {
      await this.ensureRow(tx, attorneyId);
      await tx.attorneyTrust.update({
        where: { attorney_id: attorneyId },
        data: { staff_cleared_at: null, staff_cleared_note: note },
      });
      await this.event(tx, attorneyId, TRUST_EVENT.staffUncleared, actor, {
        note,
      });
      return this.recompute(attorneyId, actor, tx);
    });
  }

  /** «Запросить ещё»: ask the attorney for documents from a template. */
  async requestDocuments(
    attorneyId: string,
    actor: TrustActor,
    template: string,
    note: string | null,
  ): Promise<TrustSnapshot | null> {
    return withTxRetry(this.prisma, async (tx) => {
      await this.ensureRow(tx, attorneyId);
      await tx.attorneyTrust.update({
        where: { attorney_id: attorneyId },
        data: {
          documents_requested_at: new Date(),
          documents_requested_template: template,
        },
      });
      await this.event(tx, attorneyId, TRUST_EVENT.documentsRequested, actor, {
        template,
        note,
      });
      await this.notify(
        tx,
        attorneyId,
        TRUST_NOTIFICATION_KIND.documentsRequested,
        { template, ...(note ? { note } : {}) },
      );
      return this.recompute(attorneyId, actor, tx);
    });
  }

  /** «Отклонить»: staff decided the account is not the attorney it claims
   * to be — suspended, bids withdrawn, the clearance (if any) withdrawn. */
  async rejectByStaff(
    attorneyId: string,
    actor: TrustActor,
    note: string | null,
  ): Promise<TrustSnapshot | null> {
    return withTxRetry(this.prisma, async (tx) => {
      const trust = await this.ensureRow(tx, attorneyId);
      const seen = await this.decisionContext(tx, attorneyId, trust);
      // The clearance is withdrawn, but who gave it stays on the row and
      // in the suspension event: the owner can see whose approval it was.
      await tx.attorneyTrust.update({
        where: { attorney_id: attorneyId },
        data: { staff_cleared_at: null },
      });
      await this.autoSuspend(tx, attorneyId, actor, {
        note,
        reason: 'staff_reject',
        ...seen,
      });
      // Owner 2026-10-05 07:00: the rejected bar numbers cannot come back
      // under another name or account (switch `trust.block_on_reject`).
      if (await this.blocks.blockOnReject()) {
        await this.blocks.blockAttorney(
          attorneyId,
          actor,
          note ?? 'Rejected by staff',
          BLOCK_SOURCE.staffReject,
          tx,
        );
      }
      return this.recompute(attorneyId, actor, tx);
    });
  }

  /**
   * The staff queue: attorneys not cleared and not suspended with something
   * only a person can settle. Oldest first.
   */
  async queue(opts: {
    reason?: string | null;
    q?: string | null;
    limit?: number;
  }): Promise<TrustSnapshot[]> {
    const limit = opts.limit ?? 100;
    const rows = await this.prisma.attorneyProfile.findMany({
      where: {
        verification_status: { in: ['verified', 'pending'] },
        OR: [{ trust: null }, { trust: { staff_cleared_at: null } }],
        ...(opts.q
          ? {
              OR: [
                { username_lower: { contains: opts.q.toLowerCase() } },
                {
                  user: {
                    OR: [
                      { first_name: { contains: opts.q, mode: 'insensitive' } },
                      { last_name: { contains: opts.q, mode: 'insensitive' } },
                    ],
                  },
                },
              ],
            }
          : {}),
      },
      select: PROFILE_SELECT,
      orderBy: { user_id: 'asc' },
      take: 2000,
    });
    const out: TrustSnapshot[] = [];
    for (const row of rows) {
      const snap = await this.snapshotOf(row);
      if (snap.staffStatus !== 'needs_staff') continue;
      if (opts.reason && !snap.queueReasons.includes(opts.reason)) continue;
      out.push(snap);
      if (out.length >= limit) break;
    }
    return out;
  }

  /**
   * «Галочки → Адвокаты»: every attorney profile with its badge status,
   * optionally one status and a name search. Newest profiles first.
   */
  async list(opts: {
    status?: BadgeStatus | null;
    q?: string | null;
    limit?: number;
  }): Promise<TrustSnapshot[]> {
    const limit = opts.limit ?? 200;
    const rows = await this.prisma.attorneyProfile.findMany({
      where: opts.q
        ? {
            OR: [
              { username_lower: { contains: opts.q.toLowerCase() } },
              {
                user: {
                  OR: [
                    { first_name: { contains: opts.q, mode: 'insensitive' } },
                    { last_name: { contains: opts.q, mode: 'insensitive' } },
                  ],
                },
              },
            ],
          }
        : {},
      select: PROFILE_SELECT,
      orderBy: { user_id: 'desc' },
      take: opts.status ? 5000 : limit,
    });
    const out: TrustSnapshot[] = [];
    for (const row of rows) {
      const snap = await this.snapshotOf(row);
      if (opts.status && snap.badgeStatus !== opts.status) continue;
      out.push(snap);
      if (out.length >= limit) break;
    }
    return out;
  }

  /** How many attorneys sit in each badge status (for the KPI row). */
  async countByStatus(): Promise<Map<BadgeStatus, number>> {
    const rows = await this.prisma.attorneyProfile.findMany({
      select: PROFILE_SELECT,
      take: 20000,
    });
    const counts = new Map<BadgeStatus, number>();
    for (const row of rows) {
      const snap = await this.snapshotOf(row);
      counts.set(snap.badgeStatus, (counts.get(snap.badgeStatus) ?? 0) + 1);
    }
    return counts;
  }

  /**
   * What only a person can settle: a firm link waiting, a name mismatch,
   * a registry difference / duplicate claim, a complaint hold, documents
   * the attorney uploaded (a submitted request with an ID / bar card), or
   * documents the rules require that were asked for and arrived.
   */
  private queueReasonsOf(
    row: ProfileRow,
    trust: NonNullable<ProfileRow['trust']>,
    missing: Requirement[],
    cleared: boolean,
  ): string[] {
    if (cleared || row.verification_status === 'suspended') return [];
    const reasons: string[] = [];
    if (trust.firm_link_status === FIRM_LINK.pending) reasons.push('firm_link');
    if (trust.name_check === NAME_CHECK.mismatch) reasons.push('name_mismatch');
    if (row.licenses.some((l) => l.registry_flag === DUPLICATE_CLAIM_FLAG))
      reasons.push('duplicate_claim');
    else if (row.licenses.some((l) => l.registry_flag))
      reasons.push('registry_flag');
    if (
      trust.payments_hold === HOLD.complaint ||
      trust.bids_hold === HOLD.complaint
    )
      reasons.push('complaint');
    const pending = row.verification_requests[0];
    if (pending && pending.documents.length > 0 && missing.length > 0)
      reasons.push('documents');
    return reasons;
  }

  // --- internals ---------------------------------------------------------

  private signalsOf(
    row: ProfileRow & { trust: NonNullable<ProfileRow['trust']> },
  ): TrustSignals {
    const verifiedLicenses = row.licenses.filter(
      (l) => l.license_status === 'verified',
    );
    const selfAttested =
      row.verification_status === 'verified' && verifiedLicenses.length > 0;
    const byRegistry = registryConfirms(row.licenses);
    const byStaff = row.trust.license_confirmed_at !== null;
    return {
      selfAttested,
      licenseConfirmed: byRegistry || byStaff,
      licenseConfirmedBy: byRegistry
        ? LICENSE_CONFIRMED_BY.registry
        : byStaff
          ? LICENSE_CONFIRMED_BY.staff
          : null,
      documentsVerified: row.trust.documents_verified_at !== null,
      stripeKyc:
        row.trust.stripe_kyc_at !== null && row.trust.stripe_charges_enabled,
      nameCheck: row.trust.name_check as NameCheck,
      firmLinkConfirmed: row.trust.firm_link_status === FIRM_LINK.confirmed,
    };
  }

  private async snapshotOf(
    row: ProfileRow,
    signals?: TrustSignals,
  ): Promise<TrustSnapshot> {
    const trust = row.trust ?? emptyTrust(row.user_id);
    const s = signals ?? this.signalsOf({ ...row, trust });
    const [requirements, bidsRequireCleared, delayDays, enabled] =
      await Promise.all([
        this.requirements(),
        this.settings.boolean('trust.bids_require_cleared'),
        this.settings.number('trust.payout_delay_days'),
        this.settings.boolean('trust.enabled'),
      ]);
    const level = row.trust_level as TrustLevel;
    const suspended = row.verification_status === 'suspended';
    const staffCleared = trust.staff_cleared_at !== null;
    const missing = missingRequirements(s, requirements);
    const cleared = isCleared(s, requirements, staffCleared);
    const gate = (needsCleared: boolean, hold: string | null): TrustGate => {
      if (suspended) return closed('suspended', missing, level);
      // Master switch off: the pre-trust mode — holds and requirements
      // stay recorded but close nothing.
      if (!enabled) {
        return { ok: true, reason: null, missing: [], current: level, hold };
      }
      if (hold) return { ...closed('hold', missing, level), hold };
      if (needsCleared && !cleared)
        return closed('requirements', missing, level);
      return {
        ok: true,
        reason: null,
        missing: [],
        current: level,
        hold: null,
      };
    };
    const queueReasons = enabled
      ? this.queueReasonsOf(row, trust, missing, cleared)
      : [];
    const staffStatus: StaffStatus = suspended
      ? 'suspended'
      : cleared
        ? 'cleared'
        : queueReasons.length > 0
          ? 'needs_staff'
          : 'self_declared';
    return {
      attorneyId: row.user_id,
      level,
      badge: row.trust_badge,
      verificationStatus: row.verification_status,
      signals: {
        ...s,
        identityConfirmed: identityConfirmed(s),
        stripeIdentity: stripeIdentity(s),
      },
      holds: {
        payments: trust.payments_hold,
        paymentsAt: trust.payments_hold_at,
        bids: trust.bids_hold,
        bidsAt: trust.bids_hold_at,
        note: trust.hold_note,
      },
      gates: {
        bids: gate(bidsRequireCleared, trust.bids_hold),
        payments: gate(true, trust.payments_hold),
      },
      requirements,
      missing,
      cleared,
      clearedBy: !cleared ? null : staffCleared ? 'staff' : 'auto',
      staffClearedAt: trust.staff_cleared_at,
      staffClearedBy: trust.staff_cleared_by,
      staffStatus,
      badgeStatus: badgeStatusOf({
        verificationStatus: row.verification_status,
        signals: s,
        cleared,
        staffStatus,
        documentsRequestedAt: trust.documents_requested_at,
      }),
      queueReasons,
      documentsRequestedAt: trust.documents_requested_at,
      documentsRequestedTemplate: trust.documents_requested_template,
      payoutDelayDays: payoutDelayFor(cleared, delayDays),
      stripeLegalName: trust.stripe_legal_name,
      stripe: {
        businessType: trust.stripe_business_type,
        companyName: trust.stripe_company_name,
        companyDomain: trust.stripe_company_domain,
        representative: trust.stripe_representative,
      },
      firmLink: {
        status: trust.firm_link_status,
        source: trust.firm_link_source,
        at: trust.firm_link_at,
        emailDomain: trust.firm_email_domain,
        note: trust.firm_link_note,
      },
      complaintsTotal: trust.complaints_total,
      duplicateClaims: trust.duplicate_claims,
      computedAt: trust.computed_at,
    };
  }

  private async ensureRow(db: Db, attorneyId: string) {
    return db.attorneyTrust.upsert({
      where: { attorney_id: attorneyId },
      create: { attorney_id: attorneyId },
      update: {},
    });
  }

  private async holdInTx(
    tx: Prisma.TransactionClient,
    attorneyId: string,
    input: {
      payments: boolean;
      bids: boolean;
      code: HoldCode;
      note: string | null;
    },
    actor: TrustActor,
    kind: string,
  ): Promise<void> {
    const trust = await this.ensureRow(tx, attorneyId);
    const now = new Date();
    const data: Prisma.AttorneyTrustUpdateInput = {};
    if (input.payments && !trust.payments_hold) {
      data.payments_hold = input.code;
      data.payments_hold_at = now;
    }
    if (input.bids && !trust.bids_hold) {
      data.bids_hold = input.code;
      data.bids_hold_at = now;
    }
    if (Object.keys(data).length === 0) return;
    if (input.note !== null) data.hold_note = input.note;
    await tx.attorneyTrust.update({ where: { attorney_id: attorneyId }, data });
    await this.event(tx, attorneyId, TRUST_EVENT.hold, actor, {
      code: input.code,
      payments: !!data.payments_hold,
      bids: !!data.bids_hold,
      note: input.note,
    });
    await this.notify(tx, attorneyId, kind, { hold: input.code });
  }

  private async releaseIfHeldFor(
    db: Db,
    attorneyId: string,
    code: HoldCode,
    actor: TrustActor,
  ): Promise<void> {
    const trust = await db.attorneyTrust.findUnique({
      where: { attorney_id: attorneyId },
    });
    if (!trust) return;
    const payments = trust.payments_hold === code;
    const bids = trust.bids_hold === code;
    if (!payments && !bids) return;
    await db.attorneyTrust.update({
      where: { attorney_id: attorneyId },
      data: {
        ...(payments && { payments_hold: null, payments_hold_at: null }),
        ...(bids && { bids_hold: null, bids_hold_at: null }),
      },
    });
    await this.event(db, attorneyId, TRUST_EVENT.release, actor, {
      code,
      payments,
      bids,
      automatic: true,
    });
    await this.notify(
      db,
      attorneyId,
      payments
        ? TRUST_NOTIFICATION_KIND.paymentsResumed
        : TRUST_NOTIFICATION_KIND.holdLifted,
      {},
    );
  }

  /** Repeated complaints: the §2.5 suspension effects without an admin
   * (verification_status → suspended, active bids withdrawn, notice). A
   * verifier restores from Admin → Верификация as usual. */
  private async autoSuspend(
    tx: Prisma.TransactionClient,
    attorneyId: string,
    actor: TrustActor,
    details: Prisma.InputJsonObject,
  ): Promise<void> {
    await tx.attorneyProfile.update({
      where: { user_id: attorneyId },
      data: { verification_status: 'suspended' },
    });
    const trustRow = await tx.attorneyTrust.findUnique({
      where: { attorney_id: attorneyId },
      select: { staff_cleared_by: true, staff_cleared_at: true },
    });
    const results = await this.bidMachine.applyToActive(
      tx,
      { attorneyId },
      'system_withdraw',
    );
    if (results.length > 0) {
      const cases = await tx.case.findMany({
        where: { id: { in: results.map((r) => r.case_id) } },
        select: { id: true, client_id: true },
      });
      const clientOf = new Map(cases.map((c) => [c.id, c.client_id]));
      for (const r of results) {
        const clientId = clientOf.get(r.case_id);
        if (!clientId) continue;
        await this.journal.append(tx, {
          caseId: r.case_id,
          clientId,
          actor: { userId: null, role: null },
          attorneyId,
          event: r.plan.event,
          payload: {
            bidId: r.id,
            reason: 'attorney_suspended',
            note: 'trust_complaints',
          },
        });
      }
    }
    await this.event(tx, attorneyId, TRUST_EVENT.autoSuspended, actor, {
      ...details,
      withdrawnBids: results.length,
      // Owner 2026-10-05: a blocked attorney shows who approved them.
      clearedBy: trustRow?.staff_cleared_by ?? null,
      clearedAt: trustRow?.staff_cleared_at?.toISOString() ?? null,
    });
    await this.notifications.emit(
      {
        type: 'verification_update',
        recipientId: attorneyId,
        payload: {
          kind: VERIFICATION_NOTIFICATION_KIND.suspended,
          reason:
            typeof details.reason === 'string'
              ? details.reason
              : 'trust_complaints',
        },
      },
      tx,
    );
  }

  /** The reporter is a client who had this attorney bid on a case of
   * theirs, or a conversation with them. */
  private async dealtWith(
    clientId: string,
    attorneyId: string,
  ): Promise<boolean> {
    const bid = await this.prisma.bid.findFirst({
      where: { attorney_id: attorneyId, case: { client_id: clientId } },
      select: { id: true },
    });
    if (bid) return true;
    const chat = await this.prisma.conversation.findFirst({
      where: { attorney_id: attorneyId, client_id: clientId },
      select: { id: true },
    });
    return chat !== null;
  }

  private async event(
    db: Db,
    attorneyId: string,
    kind: string,
    actor: TrustActor,
    details: Prisma.InputJsonObject,
  ): Promise<void> {
    const fromLevel =
      typeof details.fromLevel === 'number' ? details.fromLevel : null;
    const toLevel =
      typeof details.toLevel === 'number' ? details.toLevel : null;
    await db.attorneyTrustEvent.create({
      data: {
        attorney_id: attorneyId,
        kind,
        from_level: fromLevel,
        to_level: toLevel,
        actor_type: actor.type,
        actor_id: actor.id ?? null,
        details: actor.ip ? { ...details, ip: actor.ip } : details,
      },
    });
  }

  /** What a verifier had in front of them when deciding: the documents on
   * the open request, the automatic results, holds and the firm link. */
  private async decisionContext(
    db: Db,
    attorneyId: string,
    trust: NonNullable<ProfileRow['trust']>,
  ): Promise<Prisma.InputJsonObject> {
    const row = await db.attorneyProfile.findUnique({
      where: { user_id: attorneyId },
      select: PROFILE_SELECT,
    });
    if (!row) return {};
    const signals = this.signalsOf({ ...row, trust });
    const request = row.verification_requests[0];
    return {
      documentsSeen: request ? request.documents.map((d) => d.doc_type) : [],
      requestId: request?.id ?? null,
      signals: signals as unknown as Prisma.InputJsonObject,
      registry: row.licenses.map((l) => ({
        state: l.state_code,
        flag: l.registry_flag,
        result:
          l.auto_check_result &&
          typeof l.auto_check_result === 'object' &&
          'result' in l.auto_check_result
            ? ((l.auto_check_result as { result?: unknown }).result ?? null)
            : null,
      })) as unknown as Prisma.InputJsonArray,
      holds: { payments: trust.payments_hold, bids: trust.bids_hold },
      firmLink: trust.firm_link_status,
      nameCheck: trust.name_check,
      stripeBusinessType: trust.stripe_business_type,
    };
  }

  /**
   * Owner 2026-10-05: who approved whom. Per admin: decisions, how fast
   * they come (gaps between a verifier's consecutive decisions; under a
   * minute reads as "approving without looking"), and how many attorneys
   * they cleared later drew a complaint or a suspension.
   */
  async staffDecisions(
    period: { from?: Date; to?: Date } = {},
  ): Promise<StaffDecisionRow[]> {
    const decisions = await this.prisma.attorneyTrustEvent.findMany({
      where: {
        ...createdWithin(period),
        actor_type: TRUST_ACTOR.admin,
        kind: {
          in: [
            TRUST_EVENT.staffCleared,
            TRUST_EVENT.staffUncleared,
            TRUST_EVENT.documentsRequested,
            TRUST_EVENT.autoSuspended,
            TRUST_EVENT.release,
          ],
        },
      },
      orderBy: { created_at: 'asc' },
      select: {
        actor_id: true,
        kind: true,
        attorney_id: true,
        created_at: true,
      },
    });
    const byAdmin = new Map<string, StaffDecisionRow>();
    const clearedAttorneys = new Map<string, Map<string, Date>>();
    const lastAt = new Map<string, Date>();
    for (const d of decisions) {
      if (!d.actor_id) continue;
      let row = byAdmin.get(d.actor_id);
      if (!row) {
        row = {
          adminId: d.actor_id,
          cleared: 0,
          uncleared: 0,
          rejected: 0,
          documentsRequested: 0,
          released: 0,
          fastDecisions: 0,
          medianSecondsBetween: null,
          laterComplaints: 0,
          laterSuspended: 0,
          firstDecisionAt: d.created_at,
          lastDecisionAt: d.created_at,
          gaps: [],
        };
        byAdmin.set(d.actor_id, row);
      }
      switch (d.kind) {
        case TRUST_EVENT.staffCleared:
          row.cleared += 1;
          if (!clearedAttorneys.has(d.actor_id))
            clearedAttorneys.set(d.actor_id, new Map());
          clearedAttorneys.get(d.actor_id)?.set(d.attorney_id, d.created_at);
          break;
        case TRUST_EVENT.staffUncleared:
          row.uncleared += 1;
          break;
        case TRUST_EVENT.autoSuspended:
          row.rejected += 1;
          break;
        case TRUST_EVENT.documentsRequested:
          row.documentsRequested += 1;
          break;
        case TRUST_EVENT.release:
          row.released += 1;
          break;
      }
      const prev = lastAt.get(d.actor_id);
      if (prev) {
        const gap = (d.created_at.getTime() - prev.getTime()) / 1000;
        // Only gaps inside one sitting count as "time per decision".
        if (gap <= 3600) {
          row.gaps.push(gap);
          if (gap < 60) row.fastDecisions += 1;
        }
      }
      lastAt.set(d.actor_id, d.created_at);
      row.lastDecisionAt = d.created_at;
    }
    // What happened to the attorneys each admin cleared, after the clearance.
    const everCleared = [...clearedAttorneys.values()].flatMap((m) => [
      ...m.keys(),
    ]);
    const later = everCleared.length
      ? await this.prisma.attorneyTrustEvent.findMany({
          where: {
            attorney_id: { in: [...new Set(everCleared)] },
            kind: { in: [TRUST_EVENT.complaint, TRUST_EVENT.autoSuspended] },
          },
          select: { attorney_id: true, kind: true, created_at: true },
        })
      : [];
    for (const [adminId, attorneys] of clearedAttorneys) {
      const row = byAdmin.get(adminId);
      if (!row) continue;
      const complained = new Set<string>();
      const suspended = new Set<string>();
      for (const e of later) {
        const clearedAt = attorneys.get(e.attorney_id);
        if (!clearedAt || e.created_at <= clearedAt) continue;
        if (e.kind === TRUST_EVENT.complaint) complained.add(e.attorney_id);
        else suspended.add(e.attorney_id);
      }
      row.laterComplaints = complained.size;
      row.laterSuspended = suspended.size;
    }
    for (const row of byAdmin.values()) {
      if (row.gaps.length) {
        const sorted = [...row.gaps].sort((a, b) => a - b);
        row.medianSecondsBetween = Math.round(
          sorted[Math.floor(sorted.length / 2)],
        );
      }
    }
    return [...byAdmin.values()].sort(
      (a, b) => b.lastDecisionAt.getTime() - a.lastDecisionAt.getTime(),
    );
  }

  /** Attorneys one admin cleared, with what happened to them since. */
  async clearedBy(
    adminId: string,
    period: { from?: Date; to?: Date } = {},
  ): Promise<ClearedByRow[]> {
    const events = await this.prisma.attorneyTrustEvent.findMany({
      where: {
        ...createdWithin(period),
        kind: TRUST_EVENT.staffCleared,
        actor_id: adminId,
      },
      orderBy: { created_at: 'desc' },
      select: { attorney_id: true, created_at: true, details: true },
      take: 500,
    });
    if (events.length === 0) return [];
    const ids = [...new Set(events.map((e) => e.attorney_id))];
    const [profiles, later] = await Promise.all([
      this.prisma.attorneyProfile.findMany({
        where: { user_id: { in: ids } },
        select: {
          user_id: true,
          username: true,
          verification_status: true,
          trust_level: true,
          user: { select: { first_name: true, last_name: true } },
        },
      }),
      this.prisma.attorneyTrustEvent.findMany({
        where: {
          attorney_id: { in: ids },
          kind: { in: [TRUST_EVENT.complaint, TRUST_EVENT.autoSuspended] },
        },
        select: { attorney_id: true, kind: true, created_at: true },
      }),
    ]);
    const byId = new Map(profiles.map((p) => [p.user_id, p]));
    const seen = new Set<string>();
    const out: ClearedByRow[] = [];
    for (const e of events) {
      if (seen.has(e.attorney_id)) continue;
      seen.add(e.attorney_id);
      const p = byId.get(e.attorney_id);
      if (!p) continue;
      const after = later.filter(
        (l) => l.attorney_id === e.attorney_id && l.created_at > e.created_at,
      );
      out.push({
        attorney: {
          id: p.user_id,
          firstName: p.user.first_name,
          lastName: p.user.last_name,
          username: p.username,
          verificationStatus: p.verification_status,
        },
        level: p.trust_level,
        clearedAt: e.created_at,
        complaintsAfter: after.filter((l) => l.kind === TRUST_EVENT.complaint)
          .length,
        suspendedAfter: after.some((l) => l.kind === TRUST_EVENT.autoSuspended),
        documentsSeen:
          e.details &&
          typeof e.details === 'object' &&
          !Array.isArray(e.details) &&
          Array.isArray(
            (e.details as { documentsSeen?: unknown }).documentsSeen,
          )
            ? (e.details as { documentsSeen: unknown[] }).documentsSeen.filter(
                (d): d is string => typeof d === 'string',
              )
            : [],
      });
    }
    return out;
  }

  private async notify(
    db: Db,
    attorneyId: string,
    kind: string,
    extra: Prisma.InputJsonObject,
  ): Promise<void> {
    await this.notifications.emit(
      {
        type: 'verification_update',
        recipientId: attorneyId,
        payload: { kind, ...extra },
      },
      'attorneyTrust' in db ? undefined : db,
    );
  }
}

/** Prisma `created_at` bounds for an optional period. */
function createdWithin(period: { from?: Date; to?: Date }) {
  if (!period.from && !period.to) return {};
  return {
    created_at: {
      ...(period.from ? { gte: period.from } : {}),
      ...(period.to ? { lte: period.to } : {}),
    },
  };
}

/**
 * The badge as one word for the admin (owner 2026-10-05): not_verified →
 * self_declared → registry_matched → pending_review / documents_requested →
 * cleared; rejected and suspended on the side.
 */
export function badgeStatusOf(x: {
  verificationStatus: string;
  signals: TrustSignals;
  cleared: boolean;
  staffStatus: StaffStatus;
  documentsRequestedAt: Date | null;
}): BadgeStatus {
  if (x.verificationStatus === 'suspended') return 'suspended';
  if (x.verificationStatus === 'rejected') return 'rejected';
  if (!x.signals.selfAttested) return 'not_verified';
  if (x.cleared) return 'cleared';
  if (x.documentsRequestedAt) return 'documents_requested';
  if (x.staffStatus === 'needs_staff') return 'pending_review';
  if (x.signals.licenseConfirmed) return 'registry_matched';
  return 'self_declared';
}

function closed(
  reason: NonNullable<TrustGate['reason']>,
  missing: Requirement[],
  current: number,
): TrustGate {
  return { ok: false, reason, missing, current, hold: null };
}

function throwIfClosed(gate: TrustGate, which: 'bids' | 'payments'): void {
  if (gate.ok) return;
  if (gate.reason === 'hold') {
    throw new ForbiddenException({
      code: ErrorCode.ATTORNEY_ON_HOLD,
      message:
        which === 'payments'
          ? 'Receiving payments is paused until LawBid reviews your account.'
          : 'Bidding is paused until LawBid reviews your account.',
      details: { gate: which, hold: gate.hold },
    });
  }
  if (gate.reason === 'suspended') {
    throw new ForbiddenException({
      code: ErrorCode.ATTORNEY_SUSPENDED,
      message: 'Your profile is suspended.',
    });
  }
  throw new ForbiddenException({
    code: ErrorCode.TRUST_LEVEL_REQUIRED,
    message:
      which === 'payments'
        ? 'Confirm your identity to receive payments through LawBid.'
        : 'Confirm your identity to place bids on LawBid.',
    details: { gate: which, missing: gate.missing, current: gate.current },
  });
}

function joinName(first?: string | null, last?: string | null): string | null {
  return (
    [first, last]
      .map((x) => (x ?? '').trim())
      .filter(Boolean)
      .join(' ') || null
  );
}

function emptyTrust(attorneyId: string) {
  const now = new Date();
  return {
    attorney_id: attorneyId,
    level: 0,
    license_confirmed_at: null,
    license_confirmed_by: null,
    license_confirmed_note: null,
    documents_verified_at: null,
    documents_verified_by: null,
    stripe_kyc_at: null,
    stripe_charges_enabled: false,
    stripe_legal_name: null,
    stripe_business_type: null,
    stripe_company_name: null,
    stripe_company_domain: null,
    stripe_representative: null,
    name_check: NAME_CHECK.unknown,
    name_checked_at: null,
    firm_link_status: FIRM_LINK.none,
    firm_link_source: null,
    firm_link_at: null,
    firm_link_note: null,
    firm_email_domain: null,
    firm_email_verified_at: null,
    payments_hold: null,
    payments_hold_at: null,
    bids_hold: null,
    bids_hold_at: null,
    hold_note: null,
    complaints_total: 0,
    duplicate_claims: 0,
    payout_delay_days: null,
    staff_cleared_at: null,
    staff_cleared_by: null,
    staff_cleared_note: null,
    documents_requested_at: null,
    documents_requested_template: null,
    payout_delay_synced_at: null,
    computed_at: now,
    created_at: now,
    updated_at: now,
  };
}
