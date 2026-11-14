import { Injectable, Optional } from '@nestjs/common';
import type { VerificationProvider } from '../../../generated/prisma/client';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { AutoBarLookupProvider } from './bar-lookup/auto-bar-lookup.provider';
import { ManualIdVerificationProvider } from './manual.providers';
import { RekognitionIdVerificationProvider } from './rekognition-id-verification.provider';
import type { IdVerificationProvider } from './verification-providers';

/**
 * Picks the check implementations on every call: bar lookups per state
 * from the admin's registry settings; ID checks are always manual (a
 * person looks at the uploaded document — owner 2026-10-16, no paid
 * identity services). Owner 2026-11-12 (row 52): the selfie ↔ ID photo
 * comparison alone may run on Amazon Rekognition, behind its own switch.
 */
@Injectable()
export class VerificationProviderSelector {
  constructor(
    private readonly autoBar: AutoBarLookupProvider,
    private readonly manualId: ManualIdVerificationProvider,
    @Optional() private readonly settings?: AppSettingsService,
    @Optional()
    private readonly rekognition?: RekognitionIdVerificationProvider,
  ) {}

  /** Owner 2026-10-05: the registry is chosen per state in the admin
   * (state_bar_registries) — states without one answer `manual_review`.
   * The global flag `auto_bar_check` is the master over all of them
   * (read inside AutoBarLookupProvider). */
  barLookup(): Promise<AutoBarLookupProvider> {
    return Promise.resolve(this.autoBar);
  }

  idVerification(): Promise<{
    provider: VerificationProvider;
    impl: IdVerificationProvider;
  }> {
    return Promise.resolve({ provider: 'manual', impl: this.manualId });
  }

  /**
   * «Сравнение лица (Amazon)» (`verification.face_match.enabled`): null =
   * Выкл (default; no call at all, a person compares as before). Вкл and
   * Авто both give the Rekognition provider: Авто follows the existing
   * pattern (moderation.image.enabled) — on whenever a new pending request
   * arrives, inside the daily `id_check` cost-guard cap the caller
   * consumes. Nothing stored, a typo or a failed read = Выкл: this paid
   * biometric call never starts by accident (unlike parseSwitchMode, whose
   * unknown value is `auto`).
   */
  async faceMatch(): Promise<IdVerificationProvider | null> {
    if (!this.settings || !this.rekognition) return null;
    const raw = await this.settings
      .string('verification.face_match.enabled')
      .catch(() => 'off');
    return raw === 'on' || raw === 'auto' ? this.rekognition : null;
  }
}
