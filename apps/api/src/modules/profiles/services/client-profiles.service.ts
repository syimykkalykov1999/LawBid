import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import { FilesService } from '../../files/files.service';
import { UserProfilesService } from '../../users/services/user-profiles.service';
import { UsernameRegistry } from '../../users/services/username-registry.service';
import { BlocksService } from '../../blocks/blocks.service';
import { isValidUsername } from '../../users/services/username.util';
import type {
  ClientListItemDto,
  ClientProfileDto,
  PublicClientProfileDto,
  UpdateClientProfileDto,
  UpdateContactPreferencesDto,
} from '../dto/client-profile.dto';
import { nextUsernameChangeAt } from './attorney-profiles.service';
import { notFound } from './profile-access';

/** A client that may be listed / opened by others (OQ-026). */
const LISTABLE_CLIENT = {
  role: 'client' as const,
  status: 'active' as const,
  deleted_at: null,
};

function usernameError(
  code: ErrorCode,
  status: HttpStatus,
  message: string,
  details?: Record<string, unknown>,
): HttpException {
  return new HttpException({ code, message, details }, status);
}

function usernameTaken(): HttpException {
  return usernameError(
    ErrorCode.USERNAME_TAKEN,
    HttpStatus.CONFLICT,
    'This username is already taken.',
  );
}

/**
 * Client profile (docs/03 §5): the own profile is read and edited only
 * through /users/me/*. Anyone who is not a client with a saved profile
 * gets 404 (never 403: the answer must not reveal that a client profile
 * exists). Writes reuse the onboarding profile logic (UserProfilesService:
 * same validation, state check and single transaction).
 *
 * Owner decision 2026-09-29 (OQ-026): clients have @usernames (attorney
 * rules, one namespace with attorneys), appear in People search and have
 * a public mini-profile (`GET /clients/:username`) — name, handle, avatar,
 * state, member-since. Contacts stay behind an accepted bid (docs/06 §1.5).
 */
@Injectable()
export class ClientProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: UserProfilesService,
    private readonly usernames: UsernameRegistry,
    private readonly settings: AppSettingsService,
    private readonly files: FilesService,
    private readonly blocks: BlocksService,
  ) {}

  async getOwn(userId: string, now = new Date()): Promise<ClientProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        first_name: true,
        last_name: true,
        client_profile: {
          select: {
            username: true,
            username_changed_at: true,
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
    const username =
      profile.username ?? (await this.profiles.ensureClientUsername(userId));
    const cooldown = await this.settings.number(
      'profile.username_change_cooldown_days',
    );
    const next = nextUsernameChangeAt(
      profile.username_changed_at,
      cooldown,
      now,
    );
    return {
      id: user.id,
      username,
      usernameNextChangeAt: next?.toISOString() ?? null,
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
    now = new Date(),
  ): Promise<ClientProfileDto> {
    const current = await this.getOwn(userId, now);
    const { username, ...rest } = dto as UpdateClientProfileDto;
    if (username !== undefined && username !== current.username) {
      await this.changeUsername(userId, current, username, now);
    }
    // The rest goes through the onboarding writer (username is not one
    // of its fields — picked out so validation there stays strict).
    if (Object.keys(rest).length > 0) {
      await this.profiles.save(userId, 'client', rest);
    }
    return this.getOwn(userId, now);
  }

  /** Cooldown (409 USERNAME_CHANGE_TOO_SOON), reserved (400), taken by
   * anyone of either role (409 USERNAME_TAKEN). */
  private async changeUsername(
    userId: string,
    current: ClientProfileDto,
    username: string,
    now: Date,
  ): Promise<void> {
    const lower = username.toLowerCase();
    if (current.usernameNextChangeAt) {
      throw usernameError(
        ErrorCode.USERNAME_CHANGE_TOO_SOON,
        HttpStatus.CONFLICT,
        'Username can be changed once per cooldown period.',
        { nextChangeAt: current.usernameNextChangeAt },
      );
    }
    if ((await this.usernames.reserved()).has(lower)) {
      throw usernameError(
        ErrorCode.USERNAME_RESERVED,
        HttpStatus.BAD_REQUEST,
        'This username is reserved.',
      );
    }
    try {
      await withTxRetry(this.prisma, async (tx) => {
        if (
          lower !== current.username.toLowerCase() &&
          (await this.usernames.isTaken(tx, lower, userId))
        ) {
          throw usernameTaken();
        }
        await tx.clientProfile.update({
          where: { user_id: userId },
          data: {
            username,
            username_lower: lower,
            username_changed_at: now,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw usernameTaken();
      }
      throw error;
    }
  }

  /** People-search rows in [ids] order; clients gone since caching drop
   * out. */
  async presentMany(ids: string[]): Promise<ClientListItemDto[]> {
    if (ids.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, ...LISTABLE_CLIENT },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        avatar_file_id: true,
        client_profile: { select: { username: true, state_code: true } },
      },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const avatars = await this.files.avatarUrlsMany(
      users.map((u) => u.avatar_file_id),
    );
    const out: ClientListItemDto[] = [];
    for (const id of ids) {
      const u = byId.get(id);
      const p = u?.client_profile;
      if (!u || !p?.username) continue;
      out.push({
        id,
        username: p.username,
        firstName: u.first_name,
        lastName: u.last_name,
        avatarUrl: u.avatar_file_id
          ? (avatars.get(u.avatar_file_id)?.url256 ?? null)
          : null,
        stateCode: p.state_code,
      });
    }
    return out;
  }

  /** GET /clients/:username — 404 for unknown/malformed handles and for
   * accounts that are not active (blocked, deletion pending, deleted). */
  async getPublic(
    username: string,
    viewerId: string,
  ): Promise<PublicClientProfileDto> {
    if (!isValidUsername(username)) throw notFound();
    const row = await this.prisma.clientProfile.findUnique({
      where: { username_lower: username.toLowerCase() },
      select: {
        user_id: true,
        username: true,
        state: { select: { code: true, name: true } },
        user: {
          select: {
            role: true,
            status: true,
            deleted_at: true,
            first_name: true,
            last_name: true,
            avatar_file_id: true,
            created_at: true,
          },
        },
      },
    });
    if (
      !row?.username ||
      row.user.role !== 'client' ||
      row.user.status !== 'active' ||
      row.user.deleted_at !== null
    ) {
      throw notFound();
    }
    const avatars = await this.files.avatarUrlsMany([row.user.avatar_file_id]);
    return {
      id: row.user_id,
      username: row.username,
      firstName: row.user.first_name,
      lastName: row.user.last_name,
      avatarUrl: row.user.avatar_file_id
        ? (avatars.get(row.user.avatar_file_id)?.url ?? null)
        : null,
      state: { code: row.state.code, name: row.state.name },
      memberSince: row.user.created_at.toISOString().slice(0, 10),
      isSelf: row.user_id === viewerId,
      ...(await this.blocks.relation(viewerId, row.user_id)),
    };
  }
}
