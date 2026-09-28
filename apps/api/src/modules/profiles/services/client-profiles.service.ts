import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserProfilesService } from '../../users/services/user-profiles.service';
import type {
  ClientProfileDto,
  UpdateClientProfileDto,
  UpdateContactPreferencesDto,
} from '../dto/client-profile.dto';
import { notFound } from './profile-access';

/**
 * Client profile (docs/03 §5): closed — only the client reads or edits
 * it, always through /users/me/*, so no route takes another user's id.
 * Anyone who is not a client with a saved profile gets 404 (never 403:
 * the answer must not reveal that a client profile exists). Writes reuse
 * the onboarding profile logic (UserProfilesService: same validation,
 * state check and single transaction).
 */
@Injectable()
export class ClientProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: UserProfilesService,
  ) {}

  async getOwn(userId: string): Promise<ClientProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        first_name: true,
        last_name: true,
        client_profile: {
          select: {
            preferred_languages: true,
            preferred_contact_method: true,
            preferred_contact_note: true,
            state: { select: { code: true, name: true } },
          },
        },
      },
    });
    const profile = user?.client_profile;
    if (!user || user.role !== 'client' || !profile) throw notFound();
    return {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      state: { code: profile.state.code, name: profile.state.name },
      languages: profile.preferred_languages,
      contactMethod: profile.preferred_contact_method,
      contactNote: profile.preferred_contact_note,
    };
  }

  async update(
    userId: string,
    dto: UpdateClientProfileDto | UpdateContactPreferencesDto,
  ): Promise<ClientProfileDto> {
    await this.getOwn(userId);
    await this.profiles.save(userId, 'client', dto);
    return this.getOwn(userId);
  }
}
