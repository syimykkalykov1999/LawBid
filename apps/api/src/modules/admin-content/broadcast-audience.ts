import type { Prisma, UserRole } from '@prisma/client';

export type BroadcastAudience = 'all' | 'attorneys' | 'clients' | 'assistants';

const ROLE: Record<BroadcastAudience, UserRole | undefined> = {
  all: undefined,
  attorneys: 'attorney',
  clients: 'client',
  assistants: 'assistant',
};

/**
 * Who receives an admin broadcast: active, non-deleted users of the
 * audience. With a state filter:
 *  - a client by the state of their profile;
 *  - an attorney by any of their licenses;
 *  - an assistant (audit 2026-10-02: they have neither, so a state filter
 *    used to reach nobody) by the licenses of an attorney whose team they
 *    are an active member of — they work that attorney's state.
 */
export function broadcastAudienceWhere(
  audience: BroadcastAudience,
  stateCode?: string | null,
): Prisma.UserWhereInput {
  const byLicense = (code: string): Prisma.AttorneyProfileWhereInput => ({
    licenses: { some: { state_code: code } },
  });
  return {
    status: 'active',
    deleted_at: null,
    role: ROLE[audience] ?? { in: ['client', 'attorney', 'assistant'] },
    ...(stateCode
      ? {
          OR: [
            { client_profile: { state_code: stateCode } },
            { attorney_profile: byLicense(stateCode) },
            {
              assistant_memberships: {
                some: {
                  status: 'active',
                  attorney: { attorney_profile: byLicense(stateCode) },
                },
              },
            },
          ],
        }
      : {}),
  };
}
