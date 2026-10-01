import { Module } from '@nestjs/common';
import { BlocksModule } from '../blocks/blocks.module';
import { FilesModule } from '../files/files.module';
import { UsersModule } from '../users/users.module';
import { AttorneysController } from './controllers/attorneys.controller';
import { ClientProfileController } from './controllers/client-profile.controller';
import { ClientsController } from './controllers/clients.controller';
import { PracticeAreasController } from './controllers/practice-areas.controller';
import { AttorneyProfilesService } from './services/attorney-profiles.service';
import { ClientProfilesService } from './services/client-profiles.service';
import { PracticeAreasService } from './services/practice-areas.service';

/** docs/03_VERIFICATION_PROFILES.md: practices and states (stage 3.5),
 * client/attorney profiles and the public profile by @username (stage
 * 3.6). Reuses UsersModule's UserProfilesService for client writes. */
@Module({
  imports: [UsersModule, FilesModule, BlocksModule],
  controllers: [
    PracticeAreasController,
    AttorneysController,
    ClientProfileController,
    // OQ-026: public client mini-profile.
    ClientsController,
  ],
  providers: [
    PracticeAreasService,
    AttorneyProfilesService,
    ClientProfilesService,
  ],
  exports: [
    PracticeAreasService,
    ClientProfilesService,
    AttorneyProfilesService,
  ],
})
export class ProfilesModule {}
