import type { PrismaClient } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { demoContext } from '../../common/demo/demo-context';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { PrismaService } from '../../prisma/prisma.service';
import { CasesService } from '../cases/cases.service';
import type { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import type { FilesService } from '../files/files.service';
import type { LegalAcceptanceService } from '../legal-documents/legal-acceptance.service';
import type { UserProfilesService } from '../users/services/user-profiles.service';
import {
  OnboardingService,
  REQUIRED_CONSENTS,
} from '../users/services/onboarding.service';
import { DemoDatabaseService } from './demo-database.service';
import { DEMO_EMAIL_DOMAIN } from './demo-seed';

/**
 * Store reviewers and demo-code users (POST /demo/invites/redeem) must
 * never meet the contacts step: a seeded / created demo user has
 * `phone_e164: null` (demo-seed.ts addUser), and the demo world cannot
 * send an SMS or an e-mail. DemoDatabaseService.finishUsers stamps the
 * contacts verified, grants the consents and completes onboarding, so
 * /me `missing` is empty and POST /cases passes assertClientReady —
 * whatever the admin switch «Вход и письма по почте» (`email_login`) says.
 */

interface UserRow {
  id: string;
  role: 'client' | 'attorney' | 'assistant';
  status: 'active';
  first_name: string;
  last_name: string;
  email: string | null;
  email_verified_at: Date | null;
  phone_e164: string | null;
  phone_verified_at: Date | null;
  avatar_file_id: string | null;
  ui_language: string;
  created_at: Date;
}

/** Just enough of a PrismaClient for finishUsers + getMe. */
function fakeDb(users: UserRow[], completed: Set<string> = new Set()) {
  const consents: { user_id: string; consent_type: string }[] = [];
  const byIds = (where: { id?: { in: string[] } }) =>
    users.filter((u) => !where.id || where.id.in.includes(u.id));
  const db = {
    user: {
      findMany: ({ where }: { where: { id?: { in: string[] } } }) =>
        Promise.resolve(
          where.id ? byIds(where) : users.filter((u) => !completed.has(u.id)),
        ),
      findUnique: ({ where }: { where: { id: string } }) => {
        const u = users.find((x) => x.id === where.id);
        if (!u) return Promise.resolve(null);
        return Promise.resolve({
          ...u,
          onboarding_state: completed.has(u.id)
            ? { current_step: null, completed_at: u.created_at, data: null }
            : null,
        });
      },
      updateMany: ({
        where,
        data,
      }: {
        where: { id: { in: string[] } } & Partial<Record<string, null>>;
        data: Partial<UserRow>;
      }) => {
        const nullField = Object.keys(where).find((k) => k !== 'id');
        for (const u of byIds(where)) {
          if (nullField && u[nullField as keyof UserRow] !== null) continue;
          Object.assign(u, data);
        }
        return Promise.resolve({ count: 0 });
      },
    },
    legalDocument: { findMany: () => Promise.resolve([]) },
    userConsent: {
      createMany: ({
        data,
      }: {
        data: { user_id: string; consent_type: string }[];
      }) => {
        consents.push(...data);
        return Promise.resolve({ count: data.length });
      },
      findMany: ({ where }: { where: { user_id: string } }) =>
        Promise.resolve(
          consents
            .filter((c) => c.user_id === where.user_id)
            .map((c) => ({ consent_type: c.consent_type, granted: true })),
        ),
    },
    onboardingState: {
      createMany: ({ data }: { data: { user_id: string }[] }) => {
        for (const d of data) completed.add(d.user_id);
        return Promise.resolve({ count: data.length });
      },
    },
  };
  return db;
}

function onboardingFor(
  db: ReturnType<typeof fakeDb>,
  emailLogin: boolean,
): OnboardingService {
  const profiles = {
    facts: () =>
      Promise.resolve({
        view: null,
        clientHasState: true,
        attorneyHasLicensedStates: true,
      }),
  } as unknown as UserProfilesService;
  const files = {
    mediaUrl: () => Promise.resolve(null),
    isCleanAvatar: () => Promise.resolve(true),
  } as unknown as FilesService;
  const legal = {
    pendingFor: () => Promise.resolve([]),
  } as unknown as LegalAcceptanceService;
  const flags = {
    isEnabled: (key: string, def: boolean) =>
      Promise.resolve(key === 'email_login' ? emailLogin : def),
  } as unknown as FeatureFlagsService;
  return new OnboardingService(
    db as unknown as PrismaService,
    profiles,
    files,
    legal,
    flags,
  );
}

function casesWith(onboarding: OnboardingService): {
  assertClientReady(userId: string): Promise<void>;
} {
  const svc = Object.create(CasesService.prototype) as {
    onboarding: OnboardingService;
  };
  svc.onboarding = onboarding;
  return svc as unknown as { assertClientReady(id: string): Promise<void> };
}

/** The user row exactly as demo-seed.ts addUser writes it. */
function seededDemoClient(): UserRow {
  return {
    id: 'demo-client',
    role: 'client',
    status: 'active',
    first_name: 'Dana',
    last_name: 'Reviewer',
    email: `demo-0123456789ab@${DEMO_EMAIL_DOMAIN}`,
    email_verified_at: new Date('2026-09-01T00:00:00Z'),
    phone_e164: null,
    phone_verified_at: null,
    avatar_file_id: null,
    ui_language: 'en',
    created_at: new Date('2026-09-01T00:00:00Z'),
  };
}

async function finished(user: UserRow): Promise<ReturnType<typeof fakeDb>> {
  const db = fakeDb([user]);
  const service = new DemoDatabaseService(
    {} as PrismaService,
    {} as never,
    { setContext: () => undefined } as unknown as PinoLogger,
  );
  await service.finishUsers(db as unknown as PrismaClient, [user.id]);
  return db;
}

describe('demo accounts are never stopped by a contacts step', () => {
  it('finishUsers stamps contacts, consents and a completed onboarding', async () => {
    const user = seededDemoClient();
    const db = await finished(user);
    expect(user.phone_e164).toBeNull();
    expect(user.phone_verified_at).toBeInstanceOf(Date);
    expect(user.email_verified_at).toBeInstanceOf(Date);
    const consents = await db.userConsent.findMany({
      where: { user_id: user.id },
    });
    expect(consents.map((c) => c.consent_type).sort()).toEqual(
      [...REQUIRED_CONSENTS].sort(),
    );
  });

  it.each([
    ['on', true],
    ['off', false],
  ])(
    'email_login %s: demo client has nothing missing and can post a case',
    async (_label, emailLogin) => {
      const user = seededDemoClient();
      const db = await finished(user);
      const onboarding = onboardingFor(db, emailLogin);
      await demoContext.runDemo(async () => {
        const me = await onboarding.getMe(user.id);
        // The app's router guard sends to /onboarding/contacts only on
        // phone_verified / email_verified in `missing`.
        expect(me.missing).toEqual([]);
        expect(me.onboarding.completedAt).not.toBeNull();
        expect(me.phoneVerified).toBe(true);
        await expect(
          casesWith(onboarding).assertClientReady(user.id),
        ).resolves.toBeUndefined();
      });
    },
  );

  it.each([
    ['on', true],
    ['off', false],
  ])(
    'email_login %s: a demo attorney is not sent to the contacts step',
    async (_label, emailLogin) => {
      const user: UserRow = {
        ...seededDemoClient(),
        id: 'demo-attorney',
        role: 'attorney',
      };
      const db = await finished(user);
      const me = await demoContext.runDemo(() =>
        onboardingFor(db, emailLogin).getMe(user.id),
      );
      expect(me.missing).toEqual([]);
    },
  );
});

describe('real clients keep the contacts requirement (unchanged)', () => {
  const realClient = (over: Partial<UserRow> = {}): UserRow => ({
    ...seededDemoClient(),
    id: 'real-client',
    email: 'a@example.com',
    email_verified_at: null,
    phone_e164: '+12025550100',
    phone_verified_at: null,
    ...over,
  });

  it('email_login on: phone and e-mail both required before a case', async () => {
    const onboarding = onboardingFor(fakeDb([realClient()]), true);
    const me = await onboarding.getMe('real-client');
    expect(me.missing).toEqual(
      expect.arrayContaining(['phone_verified', 'email_verified']),
    );
    await expect(
      casesWith(onboarding).assertClientReady('real-client'),
    ).rejects.toMatchObject({
      response: {
        code: ErrorCode.CLIENT_CONTACTS_INCOMPLETE,
        details: { missing: ['phone_verified', 'email_verified'] },
      },
    });
  });

  it('email_login off: the phone alone is still required', async () => {
    const onboarding = onboardingFor(fakeDb([realClient()]), false);
    const me = await onboarding.getMe('real-client');
    expect(me.missing).toContain('phone_verified');
    expect(me.missing).not.toContain('email_verified');
    await expect(
      casesWith(onboarding).assertClientReady('real-client'),
    ).rejects.toMatchObject({
      response: {
        code: ErrorCode.CLIENT_CONTACTS_INCOMPLETE,
        details: { missing: ['phone_verified'] },
      },
    });
  });

  it('a real client with a verified phone but no finished onboarding is refused', async () => {
    const user = realClient({ phone_verified_at: new Date() });
    const onboarding = onboardingFor(fakeDb([user]), false);
    await expect(
      casesWith(onboarding).assertClientReady('real-client'),
    ).rejects.toMatchObject({
      response: { code: ErrorCode.ONBOARDING_INCOMPLETE },
    });
  });
});
