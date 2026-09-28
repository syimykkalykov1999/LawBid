import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { startNameRecheckIfVerified } from '../../users/services/attorney-name-recheck';
import { isValidUsername } from '../../users/services/username.util';
import type {
  OwnAttorneyProfileDto,
  PublicAttorneyProfileDto,
  UpdateAttorneyProfileDto,
  UsernameAvailabilityDto,
} from '../dto/attorney-profile.dto';
import { PracticeAreasService } from './practice-areas.service';
import { notFound, requireOwnAttorney } from './profile-access';

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a username changed at [changedAt] may change again, or null if
 * it may change now (never changed = the onboarding-generated one). */
export function nextUsernameChangeAt(
  changedAt: Date | null,
  cooldownDays: number,
  now: Date,
): Date | null {
  if (!changedAt || cooldownDays <= 0) return null;
  const next = new Date(changedAt.getTime() + cooldownDays * DAY_MS);
  return next > now ? next : null;
}

function usernameError(
  code: ErrorCode,
  status: HttpStatus,
  message: string,
  details?: Record<string, unknown>,
): HttpException {
  return new HttpException({ code, message, details }, status);
}

const LICENSE_SELECT = {
  id: true,
  state_code: true,
  bar_number: true,
  license_status: true,
  expires_at: true,
  rejection_code: true,
  state: { select: { code: true, name: true } },
} satisfies Prisma.AttorneyLicenseSelect;

/**
 * Attorney profile (docs/03 §4): the own editable profile, the public
 * profile by @username and the username availability check.
 *
 * Privacy (§6.2): the public view is built field by field from a
 * narrow select — bar numbers, documents and contacts are never read for
 * it, so they cannot leak through a later refactor of the DTO.
 */
@Injectable()
export class AttorneyProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly practices: PracticeAreasService,
  ) {}

  async getOwn(
    userId: string,
    now = new Date(),
  ): Promise<OwnAttorneyProfileDto> {
    await requireOwnAttorney(this.prisma, userId);
    const row = await this.prisma.attorneyProfile.findUnique({
      where: { user_id: userId },
      include: {
        user: { select: { first_name: true, last_name: true } },
        licenses: { select: LICENSE_SELECT, orderBy: { state_code: 'asc' } },
      },
    });
    if (!row) throw notFound();
    const cooldown = await this.settings.number(
      'profile.username_change_cooldown_days',
    );
    const next = nextUsernameChangeAt(row.username_changed_at, cooldown, now);
    return {
      id: row.user_id,
      username: row.username,
      firstName: row.user.first_name,
      lastName: row.user.last_name,
      bio: row.bio,
      firmName: row.firm_name,
      languages: row.languages,
      verificationStatus: row.verification_status,
      verifiedBadge:
        row.verification_status === 'verified' &&
        row.licenses.some((l) => l.license_status === 'verified'),
      usernameChangedAt: row.username_changed_at?.toISOString() ?? null,
      usernameNextChangeAt: next?.toISOString() ?? null,
      licenses: row.licenses.map((l) => ({
        id: l.id,
        state: { code: l.state.code, name: l.state.name },
        barNumber: l.bar_number,
        status: l.license_status,
        expiresAt: l.expires_at?.toISOString().slice(0, 10) ?? null,
        rejectionCode: l.rejection_code,
      })),
      rating: { avg: Number(row.rating_avg), count: row.rating_count },
      counters: {
        posts: row.posts_count,
        followers: row.followers_count,
        following: row.following_count,
      },
    };
  }

  /**
   * PATCH /attorneys/me/profile. One transaction: names on users, the
   * profile fields, and — for a changed name of a verified attorney — the
   * §4.1 re-check (profile → pending + verifier queue request).
   * Username: cooldown (profile.username_change_cooldown_days, 409
   * USERNAME_CHANGE_TOO_SOON), reserved list (400 USERNAME_RESERVED),
   * case-insensitive uniqueness (409 USERNAME_TAKEN). The username
   * generated at onboarding counts as never changed.
   */
  async updateOwn(
    userId: string,
    dto: UpdateAttorneyProfileDto,
    now = new Date(),
  ): Promise<OwnAttorneyProfileDto> {
    await requireOwnAttorney(this.prisma, userId);
    const [cooldownDays, reservedList] = await Promise.all([
      this.settings.number('profile.username_change_cooldown_days'),
      this.settings.stringList('profile.reserved_usernames'),
    ]);
    const reserved = new Set(reservedList.map((r) => r.toLowerCase()));

    try {
      await withTxRetry(this.prisma, async (tx) => {
        const current = await tx.attorneyProfile.findUnique({
          where: { user_id: userId },
          include: { user: { select: { first_name: true, last_name: true } } },
        });
        if (!current) throw notFound();

        const data: Prisma.AttorneyProfileUpdateInput = {
          ...(dto.bio !== undefined && { bio: dto.bio || null }),
          ...(dto.firmName !== undefined && {
            firm_name: dto.firmName || null,
          }),
          ...(dto.languages !== undefined && { languages: dto.languages }),
        };

        if (dto.username !== undefined && dto.username !== current.username) {
          const lower = dto.username.toLowerCase();
          const next = nextUsernameChangeAt(
            current.username_changed_at,
            cooldownDays,
            now,
          );
          if (next) {
            throw usernameError(
              ErrorCode.USERNAME_CHANGE_TOO_SOON,
              HttpStatus.CONFLICT,
              'Username can be changed once per cooldown period.',
              { nextChangeAt: next.toISOString(), cooldownDays },
            );
          }
          if (reserved.has(lower)) {
            throw usernameError(
              ErrorCode.USERNAME_RESERVED,
              HttpStatus.BAD_REQUEST,
              'This username is reserved.',
            );
          }
          if (lower !== current.username_lower) {
            const holder = await tx.attorneyProfile.findUnique({
              where: { username_lower: lower },
              select: { user_id: true },
            });
            if (holder) throw usernameTaken();
          }
          data.username = dto.username;
          data.username_lower = lower;
          data.username_changed_at = now;
        }

        if (dto.firstName !== undefined || dto.lastName !== undefined) {
          const after = await tx.user.update({
            where: { id: userId },
            data: { first_name: dto.firstName, last_name: dto.lastName },
            select: { first_name: true, last_name: true },
          });
          await startNameRecheckIfVerified(
            tx,
            userId,
            current.user,
            after,
            now,
          );
        }

        if (Object.keys(data).length > 0) {
          await tx.attorneyProfile.update({
            where: { user_id: userId },
            data,
          });
        }
      });
    } catch (error) {
      // A concurrent request took the same username_lower after our read.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw usernameTaken();
      }
      throw error;
    }
    return this.getOwn(userId, now);
  }

  /**
   * GET /attorneys/:username (docs/03 §4.2, §6). 404 NOT_FOUND for an
   * unknown or malformed username, a suspended profile ("Профиль
   * недоступен"), and an account that is not active (blocked, deletion
   * pending, deleted). Clients never have a username, so a client can
   * never be reached here. Unverified/pending/rejected profiles are shown
   * without the blue check.
   */
  async getPublic(
    username: string,
    viewerId: string,
  ): Promise<PublicAttorneyProfileDto> {
    if (!isValidUsername(username)) throw notFound();
    const row = await this.prisma.attorneyProfile.findUnique({
      where: { username_lower: username.toLowerCase() },
      select: {
        user_id: true,
        username: true,
        bio: true,
        firm_name: true,
        languages: true,
        verification_status: true,
        rating_avg: true,
        rating_count: true,
        posts_count: true,
        followers_count: true,
        following_count: true,
        user: {
          select: {
            role: true,
            status: true,
            deleted_at: true,
            first_name: true,
            last_name: true,
          },
        },
        licenses: {
          where: { license_status: 'verified' },
          select: { state: { select: { code: true, name: true } } },
          orderBy: { state_code: 'asc' },
        },
      },
    });
    if (
      !row ||
      row.verification_status === 'suspended' ||
      row.user.role !== 'attorney' ||
      row.user.status !== 'active' ||
      row.user.deleted_at !== null
    ) {
      throw notFound('Profile is unavailable.');
    }
    const states = new Map<string, string>();
    for (const l of row.licenses) states.set(l.state.code, l.state.name);
    return {
      id: row.user_id,
      username: row.username,
      firstName: row.user.first_name,
      lastName: row.user.last_name,
      bio: row.bio,
      firmName: row.firm_name,
      languages: row.languages,
      verifiedBadge:
        row.verification_status === 'verified' && row.licenses.length > 0,
      licensedStates: [...states].map(([code, name]) => ({ code, name })),
      practiceAreas: await this.practices.selectedOf(row.user_id),
      rating: { avg: Number(row.rating_avg), count: row.rating_count },
      counters: {
        posts: row.posts_count,
        followers: row.followers_count,
        following: row.following_count,
      },
      isSelf: row.user_id === viewerId,
    };
  }

  /** GET /attorneys/username-available?u= — format, reserved list and
   * case-insensitive uniqueness. The caller's own current username is
   * reported available. Reveals nothing but "is this handle free". */
  async availability(
    username: string,
    viewerId: string,
  ): Promise<UsernameAvailabilityDto> {
    const result = (
      reason: UsernameAvailabilityDto['reason'],
    ): UsernameAvailabilityDto => ({
      username,
      available: reason === null,
      reason,
    });
    if (!isValidUsername(username)) return result('invalid');
    const lower = username.toLowerCase();
    const reserved = await this.settings.stringList(
      'profile.reserved_usernames',
    );
    if (reserved.some((r) => r.toLowerCase() === lower)) {
      return result('reserved');
    }
    const holder = await this.prisma.attorneyProfile.findUnique({
      where: { username_lower: lower },
      select: { user_id: true },
    });
    return result(holder && holder.user_id !== viewerId ? 'taken' : null);
  }
}

function usernameTaken(): HttpException {
  return usernameError(
    ErrorCode.USERNAME_TAKEN,
    HttpStatus.CONFLICT,
    'This username is already taken.',
  );
}
