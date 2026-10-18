import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  ConsentType,
  Prisma,
  type LegalDocType,
  type User,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import { startNameRecheckIfVerified } from './attorney-name-recheck';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import type {
  OnboardingStep,
  SaveOnboardingStepDto,
} from '../dto/onboarding.dto';
import type { UpdateProfileDto } from '../dto/profile.dto';
import {
  LICENSED_STATES_KEY,
  UserProfilesService,
  type ProfileFacts,
  type ProfileView,
} from './user-profiles.service';
import { FilesService } from '../../files/files.service';
import {
  docLocaleOf,
  requiredDocTypes,
} from '../../legal-documents/legal-documents.constants';
import {
  LegalAcceptanceService,
  type PendingLegalDocument,
} from '../../legal-documents/legal-acceptance.service';
import { FeatureFlagsService } from '../../feature-flags/services/feature-flags.service';
import { emailFlowsOn } from '../../feature-flags/email-flows';
import { demoContext } from '../../../common/demo/demo-context';

/** docs/01_FOUNDATION_AUTH.md §10.2 H: consents that must be granted
 * before anything else in onboarding. */
export const REQUIRED_CONSENTS: readonly ConsentType[] = [
  'age_18',
  'terms',
  'privacy',
  'disclaimer',
];

export type MissingRequirement =
  | 'consents'
  | 'role'
  | 'name'
  | 'phone_verified'
  | 'email_verified'
  /** Owner 2026-10-13: the profile e-mail is required (format only). */
  | 'email'
  /** client_profiles row (state of residence, §11 3A) not saved yet. */
  | 'state'
  /** attorney picked no licensed state (§11 3B "Юрисдикция"). */
  | 'licensed_states'
  /** attorney has no clean avatar: the photo is mandatory (docs/03 §4.1,
   * OQ-012). */
  | 'photo';

/** Owner 2026-10-13: a verified phone / e-mail account without a password
 * (the demo world and assistants, who sign in with a code, are exempt). */
function passwordMissing(
  user: Pick<
    User,
    'password_hash' | 'role' | 'phone_verified_at' | 'email_verified_at'
  >,
): boolean {
  if (demoContext.isDemo()) return false;
  if (user.password_hash !== null || user.role === 'assistant') return false;
  return user.phone_verified_at !== null || user.email_verified_at !== null;
}

export interface MeView {
  hideLikeCounts: boolean;
  id: string;
  role: User['role'];
  status: User['status'];
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  phoneVerified: boolean;
  uiLanguage: string;
  theme: User['theme'];
  /** users.avatar_file_id (docs/02 §4.A) + a short-lived signed link. */
  avatarFileId: string | null;
  avatarUrl: string | null;
  requiredConsentsGranted: boolean;
  /** Owner 2026-10-05: the legal documents of the user's role that they
   * have not accepted at the current version (the app shows the
   * acceptance screen; empty = nothing to accept). */
  pendingLegalDocuments: PendingLegalDocument[];
  /** Owner 2026-10-13: the account has a sign-in password. */
  passwordSet: boolean;
  /** Owner 2026-10-13: the account still signs in only with an SMS code
   * and must set a password first (the app shows «Задайте пароль»). */
  passwordRequired: boolean;
  onboarding: {
    currentStep: string | null;
    completedAt: string | null;
    data: Prisma.JsonValue;
  };
  /** client_profiles / attorney_profiles (docs/02 §4.C) for the caller's
   * role; null before the profile step is saved. */
  profile: ProfileView | null;
  /** What still blocks POST /users/me/onboarding/complete — the Flutter
   * AppRouterGuard redirects on this instead of re-deriving the rules. */
  missing: MissingRequirement[];
}

/**
 * Server side of onboarding (docs/01_FOUNDATION_AUTH.md §11). The step
 * position lives in onboarding_state so the app can resume after being
 * closed (§15 stage 1.7 acceptance item 4); completion is only granted
 * when the hard requirements hold — the server, not the app, enforces
 * them (§11 step 3A).
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: UserProfilesService,
    private readonly files: FilesService,
    private readonly legalAcceptance: LegalAcceptanceService,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {}

  async getMe(userId: string): Promise<MeView> {
    // Owner 2026-10-18 (speed): only the columns the response uses.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        status: true,
        first_name: true,
        last_name: true,
        email: true,
        email_verified_at: true,
        phone_e164: true,
        phone_verified_at: true,
        ui_language: true,
        theme: true,
        hide_like_counts: true,
        avatar_file_id: true,
        password_hash: true,
        onboarding_state: true,
      },
    });
    if (!user) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
    }
    // Owner 2026-10-18 (speed): the legal documents are checked once, for
    // the role's documents plus the document-backed required consents;
    // both answers (pendingLegalDocuments and requiredConsentsGranted)
    // are derived from that one result.
    const roleDocTypes = requiredDocTypes(user.role);
    const consentDocTypes = REQUIRED_CONSENTS.filter((t) =>
      DOCUMENT_CONSENTS.has(t),
    ) as LegalDocType[];
    const pendingTypes = [
      ...roleDocTypes,
      ...consentDocTypes.filter((t) => !roleDocTypes.includes(t)),
    ];
    const [
      consentRowsGranted,
      facts,
      avatarUrl,
      avatarClean,
      pendingAll,
      emailOn,
      passwordOn,
    ] = await Promise.all([
      this.requiredConsentRowsGranted(userId),
      this.profiles.facts(userId, user.role, user.onboarding_state?.data),
      this.files.mediaUrl(user.avatar_file_id),
      this.files.isCleanAvatar(user.avatar_file_id, userId),
      this.legalAcceptance.pendingFor(
        userId,
        pendingTypes,
        docLocaleOf(user.ui_language),
      ),
      emailFlowsOn(this.flags),
      this.flags ? this.flags.isEnabled('password_login', true) : true,
    ]);
    const pendingLegal = pendingAll.filter((p) =>
      roleDocTypes.includes(p.docType),
    );
    const consentsOk =
      consentRowsGranted &&
      !pendingAll.some((p) => consentDocTypes.includes(p.docType));
    // Admin «Вход и письма по почте» (owner 2026-10-07): while it is off a
    // client signs up with a phone only. Turning it on later asks the
    // e-mail only of clients still in onboarding — nobody who already
    // finished is sent back to the contacts step.
    void emailOn;
    const clientEmailRequired = !user.onboarding_state?.completed_at;
    return {
      id: user.id,
      role: user.role,
      status: user.status,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      emailVerified: user.email_verified_at !== null,
      phone: user.phone_e164,
      phoneVerified: user.phone_verified_at !== null,
      uiLanguage: user.ui_language,
      theme: user.theme,
      hideLikeCounts: user.hide_like_counts,
      avatarFileId: user.avatar_file_id,
      avatarUrl,
      requiredConsentsGranted: consentsOk,
      pendingLegalDocuments: pendingLegal,
      passwordSet: user.password_hash !== null,
      passwordRequired: passwordOn && passwordMissing(user),
      onboarding: {
        currentStep: user.onboarding_state?.current_step ?? null,
        completedAt: user.onboarding_state?.completed_at?.toISOString() ?? null,
        data: user.onboarding_state?.data ?? null,
      },
      profile: facts.view,
      missing: missingRequirements(
        user,
        consentsOk,
        facts,
        avatarClean,
        clientEmailRequired,
      ),
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<void> {
    if (dto.uiLanguage !== undefined) {
      const lang = await this.prisma.i18nLanguage.findUnique({
        where: { code: dto.uiLanguage },
      });
      if (!lang?.is_active) {
        throw new BadRequestException({
          code: ErrorCode.I18N_LANGUAGE_NOT_FOUND,
          message: 'Language is not available.',
        });
      }
    }
    // docs/03 §4.1 photo / OQ-012: only the caller's own clean avatar
    // file (scanned, square-cropped, EXIF stripped) can be set; null
    // removes the photo.
    if (dto.avatarFileId) {
      await this.files.assertAttachable(userId, dto.avatarFileId, ['avatar']);
    }
    await withTxRetry(this.prisma, async (tx) => {
      const before = await tx.user.findUnique({
        where: { id: userId },
        select: { first_name: true, last_name: true, email: true },
      });
      if (!before) {
        throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
      }
      const email = dto.email?.trim().toLowerCase();
      if (email !== undefined && email !== before.email) {
        const taken = await tx.user.findFirst({
          where: { email, NOT: { id: userId } },
          select: { id: true },
        });
        if (taken) {
          throw new ConflictException({
            code: ErrorCode.CONTACT_ALREADY_EXISTS,
            message: 'This e-mail is already in use on another account.',
          });
        }
      }
      const after = await tx.user.update({
        where: { id: userId },
        data: {
          first_name: dto.firstName?.trim(),
          last_name: dto.lastName?.trim(),
          ui_language: dto.uiLanguage,
          theme: dto.theme,
          hide_like_counts: dto.hideLikeCounts,
          avatar_file_id: dto.avatarFileId,
          ...(email !== undefined && email !== before.email
            ? { email, email_verified_at: null }
            : {}),
        },
        select: { first_name: true, last_name: true },
      });
      // docs/03 §4.1: a verified attorney's new name goes to re-check.
      await startNameRecheckIfVerified(tx, userId, before, after);
    });
  }

  /** §11 step 2: the role is chosen once the profile is done — until then
   * (owner 2026-10-14) a person who took the wrong door (looked at the
   * lawyer side, hit the licence step, went back) picks again: the half-made
   * profile of the other side is removed and onboarding restarts. Once
   * onboarding is complete, or a card exists or a verification request was sent, the
   * role is final. The client refreshes its tokens afterwards. */
  async setRole(
    userId: string,
    role: 'client' | 'attorney' | 'assistant',
  ): Promise<void> {
    const locked = () =>
      new ConflictException({
        code: ErrorCode.ROLE_ALREADY_SET,
        message: 'Role has already been chosen and cannot be changed.',
      });
    await withTxRetry(this.prisma, async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          role: true,
          onboarding_state: { select: { completed_at: true } },
        },
      });
      if (!user) throw locked();
      if (user.role === null) {
        await tx.user.update({ where: { id: userId }, data: { role } });
        return;
      }
      if (user.role === role) return;
      const swappable = (r: string) => r === 'client' || r === 'attorney';
      if (
        !swappable(user.role) ||
        !swappable(role) ||
        user.onboarding_state?.completed_at
      ) {
        throw locked();
      }
      // Owner 2026-10-15: a DRAFT request exists as soon as the person opens
      // «add a state» on the verification step; it is not a submission, so it
      // does not lock the role. Only a request that was sent does.
      const [sub, sent] = await Promise.all([
        tx.subscription.count({ where: { user_id: userId } }),
        tx.verificationRequest.count({
          where: { attorney_id: userId, status: { not: 'draft' } },
        }),
      ]);
      if (sub > 0 || sent > 0) throw locked();
      const drafts = await tx.verificationRequest.findMany({
        where: { attorney_id: userId, status: 'draft' },
        select: { id: true },
      });
      const draftIds = drafts.map((d) => d.id);
      if (draftIds.length > 0) {
        await tx.verificationDocument.deleteMany({
          where: { request_id: { in: draftIds } },
        });
        await tx.verificationCheck.deleteMany({
          where: { request_id: { in: draftIds } },
        });
      }
      await tx.attorneyLicense.deleteMany({ where: { attorney_id: userId } });
      if (draftIds.length > 0) {
        await tx.verificationRequest.deleteMany({
          where: { id: { in: draftIds } },
        });
      }
      await tx.attorneyPracticeArea.deleteMany({
        where: { attorney_id: userId },
      });
      await tx.attorneyProfile.deleteMany({ where: { user_id: userId } });
      await tx.clientProfile.deleteMany({ where: { user_id: userId } });
      await tx.onboardingState.deleteMany({ where: { user_id: userId } });
      await tx.user.update({ where: { id: userId }, data: { role } });
    });
  }

  async saveStep(userId: string, dto: SaveOnboardingStepDto): Promise<void> {
    if (dto.profile) {
      // Profile + step position commit together (withTxRetry inside).
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      await this.profiles.save(userId, user?.role ?? null, dto.profile, {
        currentStep: dto.currentStep,
      });
      if (!dto.data) return;
    }
    const existing = await this.prisma.onboardingState.findUnique({
      where: { user_id: userId },
    });
    const prevData =
      existing?.data !== null &&
      typeof existing?.data === 'object' &&
      !Array.isArray(existing.data)
        ? existing.data
        : {};
    // Licensed states are server-owned (validated via `profile`); a raw
    // `data` payload must not be able to overwrite them.
    const incoming = { ...(dto.data ?? {}) };
    delete incoming[LICENSED_STATES_KEY];
    const data = { ...prevData, ...incoming } as Prisma.InputJsonObject;
    await this.prisma.onboardingState.upsert({
      where: { user_id: userId },
      create: { user_id: userId, current_step: dto.currentStep, data },
      update: { current_step: dto.currentStep, data },
    });
  }

  async complete(userId: string): Promise<void> {
    const before = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        onboarding_state: { select: { data: true, completed_at: true } },
      },
    });
    if (before?.onboarding_state?.completed_at) return;
    // Upsert the profile row at completion too: migrates the free-form
    // `data.profile` of older app builds and guarantees an attorney row.
    await this.profiles.ensureForCompletion(
      userId,
      before?.role ?? null,
      before?.onboarding_state?.data,
    );
    const me = await this.getMe(userId);
    if (me.onboarding.completedAt !== null) return;
    if (me.missing.length > 0) {
      const contactsOnly = me.missing.every(
        (m) => m === 'phone_verified' || m === 'email',
      );
      throw new ForbiddenException({
        code:
          contactsOnly && me.role === 'client'
            ? ErrorCode.CLIENT_CONTACTS_INCOMPLETE
            : ErrorCode.ONBOARDING_INCOMPLETE,
        message: 'Onboarding requirements are not met.',
        details: { missing: me.missing },
      });
    }
    const step: OnboardingStep = 'tour';
    await this.prisma.onboardingState.upsert({
      where: { user_id: userId },
      create: { user_id: userId, current_step: step, completed_at: new Date() },
      update: { completed_at: new Date() },
    });
  }

  /**
   * Current consent state = latest row per (user, type) (docs/02 §4.A).
   * docs/06 §2.3 item 10: for consents that point at a legal document
   * (terms, privacy, disclaimer) a newer published version that was
   * flagged `requires_reacceptance` puts `consents` back into `missing`, so the app's guard sends
   * the user to the consents step on the next sign-in.
   */
  private async requiredConsentRowsGranted(userId: string): Promise<boolean> {
    const rows = await this.prisma.userConsent.findMany({
      where: {
        user_id: userId,
        consent_type: { in: [...REQUIRED_CONSENTS] },
      },
      orderBy: { created_at: 'desc' },
      distinct: ['consent_type'],
      select: { consent_type: true, granted: true },
    });
    // Owner 2026-10-05: a newer version asks again only when it was
    // published as a material change (requires_reacceptance); a consent
    // without a document (before versions existed) still counts. That
    // second check is the pending list in getMe.
    return REQUIRED_CONSENTS.every(
      (t) => rows.find((r) => r.consent_type === t)?.granted === true,
    );
  }
}

/** Consent types backed by a legal_documents row (LegalDocType). */
const DOCUMENT_CONSENTS: ReadonlySet<ConsentType> = new Set<ConsentType>([
  'terms',
  'privacy',
  'disclaimer',
]);

/** §11 guard rules: client needs BOTH phone and email verified (email
 * only while `clientEmailRequired`, see getMe) and a
 * state of residence (3A); attorney needs a verified phone, at least one
 * licensed state (3B) and a clean photo (docs/03 §4.1, OQ-012).
 * `profile` / `avatarClean` omitted = not checked. */
export function missingRequirements(
  user: Pick<
    User,
    | 'role'
    | 'first_name'
    | 'last_name'
    | 'phone_verified_at'
    | 'email_verified_at'
    | 'email'
  >,
  consentsGranted: boolean,
  profile?: Pick<ProfileFacts, 'clientHasState' | 'attorneyHasLicensedStates'>,
  avatarClean?: boolean,
  clientEmailRequired = true,
): MissingRequirement[] {
  const missing: MissingRequirement[] = [];
  if (!consentsGranted) missing.push('consents');
  if (user.role === null) missing.push('role');
  if (!user.first_name || !user.last_name) missing.push('name');
  // Owner 2026-10-04: an assistant comes in with the attorney's one-time
  // code (no SMS), so no phone is required of them.
  if (user.role === 'client' || user.role === 'attorney') {
    if (user.phone_verified_at === null) missing.push('phone_verified');
  }
  // Owner 2026-10-13: no code is sent to the e-mail — it is a required
  // profile field (client and attorney), format checked, never verified.
  if (
    clientEmailRequired &&
    (user.role === 'client' || user.role === 'attorney') &&
    !user.email
  ) {
    missing.push('email');
  }
  if (profile && user.role === 'client' && !profile.clientHasState) {
    missing.push('state');
  }
  if (
    profile &&
    user.role === 'attorney' &&
    !profile.attorneyHasLicensedStates
  ) {
    missing.push('licensed_states');
  }
  if (avatarClean === false && user.role === 'attorney') {
    missing.push('photo');
  }
  return missing;
}
