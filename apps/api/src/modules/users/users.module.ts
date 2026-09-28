import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { UsersController } from './controllers/users.controller';
import { ContactsService } from './services/contacts.service';
import { ConsentsService } from './services/consents.service';
import { AccountDeletionService } from './services/account-deletion.service';
import { OnboardingService } from './services/onboarding.service';
import { UserProfilesService } from './services/user-profiles.service';
import { AccountIdentifiersService } from './services/account-identifiers.service';

/**
 * docs/01_FOUNDATION_AUTH.md §15 stage 1.4. Imports AuthModule for the
 * providers it exports (OtpService, SessionRevocationService, ReauthGuard,
 * AuthEventService) rather than re-providing them here — one instance of
 * each per process, and ReauthGuard/OtpService's security properties
 * (Redis-backed single-use tokens, attempt lockout) must be shared state,
 * not per-module copies.
 */
@Module({
  imports: [AuthModule, FilesModule],
  controllers: [UsersController],
  providers: [
    ContactsService,
    ConsentsService,
    AccountDeletionService,
    OnboardingService,
    UserProfilesService,
    AccountIdentifiersService,
  ],
  exports: [OnboardingService, UserProfilesService],
})
export class UsersModule {}
