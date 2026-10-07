import { Global, Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AuthModule } from '../auth/auth.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AdminCountriesController } from './admin-countries.controller';
import { AdminCountriesService } from './admin-countries.service';
import { CountriesController } from './countries.controller';
import { CountriesService } from './countries.service';

/** Owner 2026-10-05: which countries LawBid works in. `@Global()` because
 * sign-up, profiles, cases, payments and support all ask it. */
@Global()
@Module({
  providers: [CountriesService],
  exports: [CountriesService],
})
export class CountriesCoreModule {}

/** The HTTP side: the public list + waiting list, and Система → Страны.
 * API process only. */
@Module({
  imports: [
    CountriesCoreModule,
    AdminAccessModule,
    // EMAIL_PROVIDER for the waiting-list e-mails.
    AuthModule,
    // «Вход и письма по почте» gates joining and the e-mails.
    FeatureFlagsModule,
  ],
  controllers: [CountriesController, AdminCountriesController],
  providers: [AdminCountriesService],
})
export class CountriesModule {}
