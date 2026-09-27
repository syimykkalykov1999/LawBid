import { Module } from '@nestjs/common';
import {
  ManualBarLookupProvider,
  ManualIdVerificationProvider,
} from './providers/manual.providers';
import {
  BAR_LOOKUP_PROVIDER,
  ID_VERIFICATION_PROVIDER,
} from './providers/verification-providers';

/** docs/03_VERIFICATION_PROFILES.md stage 3.1 skeleton. Requests, checks
 * and the verifier admin API arrive in stages 3.3–3.4. */
@Module({
  providers: [
    { provide: BAR_LOOKUP_PROVIDER, useClass: ManualBarLookupProvider },
    {
      provide: ID_VERIFICATION_PROVIDER,
      useClass: ManualIdVerificationProvider,
    },
  ],
  exports: [BAR_LOOKUP_PROVIDER, ID_VERIFICATION_PROVIDER],
})
export class VerificationModule {}
