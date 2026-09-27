import { IsIn, IsObject, IsOptional } from 'class-validator';

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

  /** Step-local form data (e.g. client state/languages until the
   * client_profiles table lands in stage 2.3). Merged, not replaced. */
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
