import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConsentType, Prisma, type User } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import type {
  OnboardingStep,
  SaveOnboardingStepDto,
} from '../dto/onboarding.dto';
import type { UpdateProfileDto } from '../dto/profile.dto';

/** docs/01_FOUNDATION_AUTH.md §10.2 H: consents that must be granted
 * before anything else in onboarding. */
export const REQUIRED_CONSENTS: readonly ConsentType[] = [
  'age_18',
  'terms',
  'privacy',
  'disclaimer',
];

export type MissingRequirement =
  'consents' | 'role' | 'name' | 'phone_verified' | 'email_verified';

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
  requiredConsentsGranted: boolean;
  onboarding: {
    currentStep: string | null;
    completedAt: string | null;
    data: Prisma.JsonValue;
  };
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
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string): Promise<MeView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { onboarding_state: true },
    });
    if (!user) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
    }
    const consentsOk = await this.requiredConsentsGranted(userId);
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
      requiredConsentsGranted: consentsOk,
      onboarding: {
        currentStep: user.onboarding_state?.current_step ?? null,
        completedAt: user.onboarding_state?.completed_at?.toISOString() ?? null,
        data: user.onboarding_state?.data ?? null,
      },
      missing: missingRequirements(user, consentsOk),
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
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        first_name: dto.firstName?.trim(),
        last_name: dto.lastName?.trim(),
        ui_language: dto.uiLanguage,
        theme: dto.theme,
      },
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
    const existing = await this.prisma.onboardingState.findUnique({
      where: { user_id: userId },
    });
    const prevData =
      existing?.data !== null &&
      typeof existing?.data === 'object' &&
      !Array.isArray(existing.data)
        ? existing.data
        : {};
    const data = {
      ...prevData,
      ...(dto.data ?? {}),
    } as Prisma.InputJsonObject;
    await this.prisma.onboardingState.upsert({
      where: { user_id: userId },
      create: { user_id: userId, current_step: dto.currentStep, data },
      update: { current_step: dto.currentStep, data },
    });
  }

  async complete(userId: string): Promise<void> {
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

/** §11 guard rules: client needs BOTH phone and email verified; attorney
 * needs a verified phone (§11 step 3B). */
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
  return missing;
}
