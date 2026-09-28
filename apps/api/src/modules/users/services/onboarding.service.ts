import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConsentType, Prisma, type User } from '@prisma/client';
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
  /** client_profiles row (state of residence, §11 3A) not saved yet. */
  | 'state'
  /** attorney picked no licensed state (§11 3B "Юрисдикция"). */
  | 'licensed_states'
  /** attorney has no clean avatar: the photo is mandatory (docs/03 §4.1,
   * OQ-012). */
  | 'photo';

export interface MeView {
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
  ) {}

  async getMe(userId: string): Promise<MeView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { onboarding_state: true },
    });
    if (!user) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
    }
    const [consentsOk, facts, avatarUrl, avatarClean] = await Promise.all([
      this.requiredConsentsGranted(userId),
      this.profiles.facts(userId, user.role, user.onboarding_state?.data),
      this.files.mediaUrl(user.avatar_file_id),
      this.files.isCleanAvatar(user.avatar_file_id, userId),
    ]);
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
      avatarFileId: user.avatar_file_id,
      avatarUrl,
      requiredConsentsGranted: consentsOk,
      onboarding: {
        currentStep: user.onboarding_state?.current_step ?? null,
        completedAt: user.onboarding_state?.completed_at?.toISOString() ?? null,
        data: user.onboarding_state?.data ?? null,
      },
      profile: facts.view,
      missing: missingRequirements(user, consentsOk, facts, avatarClean),
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
        select: { first_name: true, last_name: true },
      });
      if (!before) {
        throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
      }
      const after = await tx.user.update({
        where: { id: userId },
        data: {
          first_name: dto.firstName?.trim(),
          last_name: dto.lastName?.trim(),
          ui_language: dto.uiLanguage,
          theme: dto.theme,
          avatar_file_id: dto.avatarFileId,
        },
        select: { first_name: true, last_name: true },
      });
      // docs/03 §4.1: a verified attorney's new name goes to re-check.
      await startNameRecheckIfVerified(tx, userId, before, after);
    });
  }

  /** §11 step 2: "роль потом изменить нельзя" — set exactly once. The
   * conditional updateMany makes two racing requests safe: only one can
   * move role from NULL. The client refreshes its tokens afterwards to
   * get the new `role` claim. */
  async setRole(userId: string, role: 'client' | 'attorney'): Promise<void> {
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, role: null },
      data: { role },
    });
    if (count === 0) {
      throw new ConflictException({
        code: ErrorCode.ROLE_ALREADY_SET,
        message: 'Role has already been chosen and cannot be changed.',
      });
    }
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
        (m) => m === 'phone_verified' || m === 'email_verified',
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

  /** Current consent state = latest row per (user, type) (docs/02 §4.A). */
  private async requiredConsentsGranted(userId: string): Promise<boolean> {
    const rows = await this.prisma.userConsent.findMany({
      where: { user_id: userId, consent_type: { in: [...REQUIRED_CONSENTS] } },
      orderBy: { created_at: 'desc' },
      distinct: ['consent_type'],
      select: { consent_type: true, granted: true },
    });
    return REQUIRED_CONSENTS.every(
      (t) => rows.find((r) => r.consent_type === t)?.granted === true,
    );
  }
}

/** §11 guard rules: client needs BOTH phone and email verified and a
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
  >,
  consentsGranted: boolean,
  profile?: Pick<ProfileFacts, 'clientHasState' | 'attorneyHasLicensedStates'>,
  avatarClean?: boolean,
): MissingRequirement[] {
  const missing: MissingRequirement[] = [];
  if (!consentsGranted) missing.push('consents');
  if (user.role === null) missing.push('role');
  if (!user.first_name || !user.last_name) missing.push('name');
  if (user.role === 'client' || user.role === 'attorney') {
    if (user.phone_verified_at === null) missing.push('phone_verified');
  }
  if (user.role === 'client' && user.email_verified_at === null) {
    missing.push('email_verified');
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
