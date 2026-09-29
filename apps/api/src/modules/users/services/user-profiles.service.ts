import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  ContactMethod,
  Prisma,
  type UserRole,
  type VerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import {
  ATTORNEY_ONLY_FIELDS,
  BIO_MAX_LENGTH,
  CLIENT_ONLY_FIELDS,
  CONTACT_NOTE_MAX_LENGTH,
  FIRM_NAME_MAX_LENGTH,
  MAX_LANGUAGES,
  MAX_STATES,
  type OnboardingProfileDto,
} from '../dto/onboarding-profile.dto';
import { ISO_639_1_CODES } from '../iso-639-1';
import { CLIENT_USERNAME_FALLBACK, USERNAME_FALLBACK } from './username.util';
import { UsernameRegistry } from './username-registry.service';
import { startNameRecheckIfVerified } from './attorney-name-recheck';

/** Digits reserved for a numeric suffix when reading taken usernames. */

/** Server-owned key of onboarding_state.data holding the attorney's
 * licensed states (§11 3B multi-select). Bar numbers come with
 * verification (docs/03), so these can't be attorney_licenses rows yet;
 * a client-sent `data` can't overwrite this key (see OnboardingService). */
export const LICENSED_STATES_KEY = 'licensedStates';

export interface ClientProfileView {
  /** Owner 2026-09-29 (OQ-026): clients have @usernames too. */
  username: string;
  stateCode: string;
  languages: string[];
  contactMethod: ContactMethod | null;
  contactNote: string | null;
}

export interface AttorneyProfileView {
  username: string;
  bio: string | null;
  firmName: string | null;
  languages: string[];
  licensedStates: string[];
  verificationStatus: VerificationStatus;
}

export type ProfileView = ClientProfileView | AttorneyProfileView;

/** Profile facts OnboardingService needs for `missing` (§11). */
export interface ProfileFacts {
  view: ProfileView | null;
  clientHasState: boolean;
  attorneyHasLicensedStates: boolean;
}

type Tx = Prisma.TransactionClient;

/** Extra writes that must commit together with the profile upsert. */
export interface ProfileTxExtras {
  currentStep?: string;
  completedAt?: Date;
}

const USERNAME_ATTEMPTS = 5;

/**
 * client_profiles / attorney_profiles (docs/02 §4.C) as filled by the
 * onboarding profile step (docs/01 §11 3A/3B). Validation that needs the
 * DB (state codes exist in `states`) or the caller's role lives here; the
 * DTO covers shapes and lengths. Every save is one withTxRetry
 * transaction: names on users + the profile row + onboarding_state.
 */
@Injectable()
export class UserProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usernames: UsernameRegistry,
  ) {}

  async facts(
    userId: string,
    role: UserRole | null,
    onboardingData: Prisma.JsonValue | undefined,
  ): Promise<ProfileFacts> {
    const none: ProfileFacts = {
      view: null,
      clientHasState: false,
      attorneyHasLicensedStates: false,
    };
    if (role === 'client') {
      const row = await this.prisma.clientProfile.findUnique({
        where: { user_id: userId },
      });
      if (!row) return none;
      return {
        ...none,
        clientHasState: true,
        view: {
          username: row.username ?? (await this.ensureClientUsername(userId)),
          stateCode: row.state_code,
          languages: row.preferred_languages,
          contactMethod: row.preferred_contact_method,
          contactNote: row.preferred_contact_note,
        },
      };
    }
    if (role === 'attorney') {
      const licensedStates = licensedStatesOf(onboardingData);
      const row = await this.prisma.attorneyProfile.findUnique({
        where: { user_id: userId },
      });
      return {
        ...none,
        attorneyHasLicensedStates: licensedStates.length > 0,
        view: row
          ? {
              username: row.username,
              bio: row.bio,
              firmName: row.firm_name,
              languages: row.languages,
              licensedStates,
              verificationStatus: row.verification_status,
            }
          : null,
      };
    }
    return none;
  }

  /**
   * Validates [dto] for [role] and upserts it (plus names and [extras]) in
   * one transaction. Throws VALIDATION_ERROR (400) for fields of the other
   * role, unknown/inactive states, or a first client save without a state.
   */
  async save(
    userId: string,
    role: UserRole | null,
    dto: OnboardingProfileDto,
    extras: ProfileTxExtras = {},
  ): Promise<void> {
    if (role !== 'client' && role !== 'attorney') {
      throw validation('Choose a role before filling in the profile.', {
        field: 'role',
      });
    }
    const foreign = (
      role === 'client' ? ATTORNEY_ONLY_FIELDS : CLIENT_ONLY_FIELDS
    ).filter((f) => dto[f] !== undefined);
    if (foreign.length > 0) {
      throw validation(`Fields not allowed for role ${role}.`, {
        fields: foreign,
      });
    }
    const states = [
      ...(dto.stateCode ? [dto.stateCode] : []),
      ...(dto.licensedStates ?? []),
    ];
    await this.assertStatesExist(states);

    if (role === 'client') {
      await this.saveClient(userId, dto, extras);
    } else {
      await this.saveAttorney(userId, dto, extras);
    }
  }

  /**
   * Completion-time upsert (docs/01 §11): an app build that only sent the
   * old free-form `data.profile` JSON gets it migrated into the profile
   * table (invalid values dropped, not fatal), and an attorney always
   * leaves onboarding with an attorney_profiles row (username is NN).
   * Returns without writing when nothing needs to change.
   */
  async ensureForCompletion(
    userId: string,
    role: UserRole | null,
    onboardingData: Prisma.JsonValue | undefined,
  ): Promise<void> {
    const legacy = await this.legacyProfile(role, onboardingData);
    if (role === 'client') {
      const exists = await this.prisma.clientProfile.findUnique({
        where: { user_id: userId },
        select: { user_id: true },
      });
      if (!exists && legacy?.stateCode) {
        await this.saveClient(userId, legacy, {});
      }
    } else if (role === 'attorney') {
      const exists = await this.prisma.attorneyProfile.findUnique({
        where: { user_id: userId },
        select: { user_id: true },
      });
      const needsStates =
        licensedStatesOf(onboardingData).length === 0 &&
        (legacy?.licensedStates?.length ?? 0) > 0;
      if (!exists || needsStates) {
        await this.saveAttorney(
          userId,
          exists ? { licensedStates: legacy?.licensedStates } : (legacy ?? {}),
          {},
        );
      }
    }
  }

  // --- internals ---

  private async saveClient(
    userId: string,
    dto: OnboardingProfileDto,
    extras: ProfileTxExtras,
  ): Promise<void> {
    try {
      await this.saveClientTx(userId, dto, extras);
    } catch (error) {
      // Two parallel first saves both tried to INSERT: the loser re-runs
      // and now finds the row, so it updates instead.
      if (!isUniqueViolation(error)) throw error;
      await this.saveClientTx(userId, dto, extras);
    }
  }

  private async saveClientTx(
    userId: string,
    dto: OnboardingProfileDto,
    extras: ProfileTxExtras,
  ): Promise<void> {
    await withTxRetry(this.prisma, async (tx) => {
      await this.updateNames(tx, userId, dto);
      const existing = await tx.clientProfile.findUnique({
        where: { user_id: userId },
        select: { user_id: true },
      });
      const fields = {
        ...(dto.stateCode !== undefined && { state_code: dto.stateCode }),
        ...(dto.languages !== undefined && {
          preferred_languages: dto.languages,
        }),
        ...(dto.contactMethod !== undefined && {
          preferred_contact_method: dto.contactMethod,
        }),
        ...(dto.contactNote !== undefined && {
          preferred_contact_note: dto.contactNote || null,
        }),
      };
      if (existing) {
        await tx.clientProfile.update({
          where: { user_id: userId },
          data: fields,
        });
      } else {
        if (!dto.stateCode) {
          throw validation('State of residence is required.', {
            field: 'stateCode',
            reason: 'required',
          });
        }
        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { first_name: true, last_name: true },
        });
        const username = await this.usernames.allocate(
          tx,
          user.first_name,
          user.last_name,
          CLIENT_USERNAME_FALLBACK,
        );
        await tx.clientProfile.create({
          data: {
            preferred_languages: [],
            ...fields,
            user_id: userId,
            state_code: dto.stateCode,
            username,
            username_lower: username.toLowerCase(),
          },
        });
      }
      await this.writeOnboarding(tx, userId, extras, undefined);
    });
  }

  /**
   * OQ-026: a client row created before usernames existed gets one the
   * first time its profile is read (one write per legacy client). Retries
   * on a unique-violation race like the attorney path.
   */
  async ensureClientUsername(userId: string): Promise<string> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await withTxRetry(this.prisma, async (tx) => {
          const row = await tx.clientProfile.findUniqueOrThrow({
            where: { user_id: userId },
            select: {
              username: true,
              user: { select: { first_name: true, last_name: true } },
            },
          });
          if (row.username) return row.username;
          const username = await this.usernames.allocate(
            tx,
            row.user.first_name,
            row.user.last_name,
            CLIENT_USERNAME_FALLBACK,
          );
          await tx.clientProfile.update({
            where: { user_id: userId },
            data: { username, username_lower: username.toLowerCase() },
          });
          return username;
        });
      } catch (error) {
        if (isUniqueViolation(error) && attempt < USERNAME_ATTEMPTS) continue;
        throw error;
      }
    }
  }

  private async saveAttorney(
    userId: string,
    dto: OnboardingProfileDto,
    extras: ProfileTxExtras,
  ): Promise<void> {
    const reserved = await this.usernames.reserved();
    for (let attempt = 1; ; attempt += 1) {
      try {
        await withTxRetry(this.prisma, async (tx) => {
          const user = await this.updateNames(tx, userId, dto);
          const existing = await tx.attorneyProfile.findUnique({
            where: { user_id: userId },
            select: { user_id: true },
          });
          const fields = {
            ...(dto.bio !== undefined && { bio: dto.bio || null }),
            ...(dto.firmName !== undefined && {
              firm_name: dto.firmName || null,
            }),
            ...(dto.languages !== undefined && { languages: dto.languages }),
          };
          if (existing) {
            await tx.attorneyProfile.update({
              where: { user_id: userId },
              data: fields,
            });
          } else {
            const username = await this.usernames.allocate(
              tx,
              user.first_name,
              user.last_name,
              USERNAME_FALLBACK,
              reserved,
            );
            await tx.attorneyProfile.create({
              data: {
                languages: [],
                ...fields,
                user_id: userId,
                username,
                username_lower: username.toLowerCase(),
              },
            });
          }
          await this.writeOnboarding(tx, userId, extras, dto.licensedStates);
        });
        return;
      } catch (error) {
        // Another attorney took the same generated username between our
        // read and insert: regenerate (the taken set is re-read).
        if (isUniqueViolation(error) && attempt < USERNAME_ATTEMPTS) continue;
        throw error;
      }
    }
  }

  private async updateNames(
    tx: Tx,
    userId: string,
    dto: OnboardingProfileDto,
  ): Promise<{ first_name: string | null; last_name: string | null }> {
    if (dto.firstName === undefined && dto.lastName === undefined) {
      return tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { first_name: true, last_name: true },
      });
    }
    const before = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { first_name: true, last_name: true },
    });
    const after = await tx.user.update({
      where: { id: userId },
      data: { first_name: dto.firstName, last_name: dto.lastName },
      select: { first_name: true, last_name: true },
    });
    // docs/03 §4.1: a verified attorney's new name goes to re-check.
    await startNameRecheckIfVerified(tx, userId, before, after);
    return after;
  }

  private async writeOnboarding(
    tx: Tx,
    userId: string,
    extras: ProfileTxExtras,
    licensedStates: string[] | undefined,
  ): Promise<void> {
    if (
      extras.currentStep === undefined &&
      extras.completedAt === undefined &&
      licensedStates === undefined
    ) {
      return;
    }
    const existing = await tx.onboardingState.findUnique({
      where: { user_id: userId },
    });
    const data =
      licensedStates === undefined
        ? undefined
        : ({
            ...jsonObject(existing?.data),
            [LICENSED_STATES_KEY]: licensedStates,
          } as Prisma.InputJsonObject);
    await tx.onboardingState.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        current_step: extras.currentStep,
        completed_at: extras.completedAt,
        data,
      },
      update: {
        current_step: extras.currentStep,
        completed_at: extras.completedAt,
        data,
      },
    });
  }

  private async assertStatesExist(codes: string[]): Promise<void> {
    if (codes.length === 0) return;
    const unique = [...new Set(codes)];
    const found = await this.prisma.state.findMany({
      where: { code: { in: unique }, is_active: true },
      select: { code: true },
    });
    const known = new Set(found.map((s) => s.code));
    const invalid = unique.filter((c) => !known.has(c));
    if (invalid.length > 0) {
      throw validation('Unknown state code.', { states: invalid });
    }
  }

  /** Best-effort read of the pre-structured `data.profile` JSON (older
   * app builds): only values that would pass the DTO survive. */
  private async legacyProfile(
    role: UserRole | null,
    onboardingData: Prisma.JsonValue | undefined,
  ): Promise<OnboardingProfileDto | null> {
    const raw = jsonObject(jsonObject(onboardingData).profile);
    if (Object.keys(raw).length === 0) return null;
    const str = (v: unknown, max: number): string | undefined =>
      typeof v === 'string' && v.trim().length <= max ? v.trim() : undefined;
    const codes = (v: unknown, max: number): string[] =>
      Array.isArray(v)
        ? [
            ...new Set(v.filter((x): x is string => typeof x === 'string')),
          ].slice(0, max)
        : [];
    const languages = codes(raw.languages, MAX_LANGUAGES)
      .map((l) => l.toLowerCase())
      .filter((l) => ISO_639_1_CODES.has(l));
    const knownStates = async (list: string[]): Promise<string[]> => {
      const upper = list.map((s) => s.toUpperCase());
      if (upper.length === 0) return [];
      const rows = await this.prisma.state.findMany({
        where: { code: { in: upper }, is_active: true },
        select: { code: true },
      });
      const ok = new Set(rows.map((r) => r.code));
      return upper.filter((s) => ok.has(s));
    };
    if (role === 'client') {
      const [stateCode] = await knownStates(
        typeof raw.state === 'string' ? [raw.state] : [],
      );
      const method = legacyContactMethod(raw.contactMethod);
      return {
        stateCode,
        languages,
        contactMethod: method,
        contactNote: str(raw.contactTime, CONTACT_NOTE_MAX_LENGTH),
      };
    }
    if (role === 'attorney') {
      return {
        bio: str(raw.bio, BIO_MAX_LENGTH),
        firmName: str(raw.firm, FIRM_NAME_MAX_LENGTH),
        languages,
        licensedStates: await knownStates(
          codes(raw.licensedStates, MAX_STATES),
        ),
      };
    }
    return null;
  }
}

export function licensedStatesOf(
  onboardingData: Prisma.JsonValue | undefined,
): string[] {
  const list = jsonObject(onboardingData)[LICENSED_STATES_KEY];
  return Array.isArray(list)
    ? list.filter((s): s is string => typeof s === 'string')
    : [];
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Older app builds sent `chat` for the in-app chat option. */
function legacyContactMethod(value: unknown): ContactMethod | undefined {
  if (value === 'chat') return ContactMethod.in_app_chat;
  return typeof value === 'string' &&
    (Object.values(ContactMethod) as string[]).includes(value)
    ? (value as ContactMethod)
    : undefined;
}

/** A unique violation inside a profile upsert: a generated username_lower
 * taken concurrently, or a parallel request that created the same user's
 * row first. Both resolve by re-running the transaction (it re-reads the
 * taken set / finds the row and updates it). */
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

/** VALIDATION_ERROR with machine-readable details. A plain HttpException
 * (not BadRequestException): AllExceptionsFilter replaces a
 * BadRequestException's details with class-validator's message list. */
function validation(
  message: string,
  details: Record<string, unknown>,
): HttpException {
  return new HttpException(
    { code: ErrorCode.VALIDATION_ERROR, message, details },
    HttpStatus.BAD_REQUEST,
  );
}
