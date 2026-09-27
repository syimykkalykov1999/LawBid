import { Type } from 'class-transformer';
import { IsIn, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { OnboardingProfileDto } from './onboarding-profile.dto';

/** docs/01_FOUNDATION_AUTH.md §11: server-side step names, mirrored by the
 * Flutter AppRouterGuard's /onboarding/<step> routes. */
export const ONBOARDING_STEPS = [
  'consents',
  'role',
  'profile',
  'contacts',
  'push',
  'verification',
  'tour',
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export class SaveOnboardingStepDto {
  @IsIn(ONBOARDING_STEPS)
  currentStep!: OnboardingStep;

  /** Free-form step-local UI data. Merged, not replaced. Profile fields
   * belong in [profile], which lands in client_profiles /
   * attorney_profiles. */
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  /** The profile step's structured fields (docs/01 §11 3A/3B), upserted
   * into the role's profile table in the same transaction as the step. */
  @IsOptional()
  @ValidateNested()
  @Type(() => OnboardingProfileDto)
  profile?: OnboardingProfileDto;
}
