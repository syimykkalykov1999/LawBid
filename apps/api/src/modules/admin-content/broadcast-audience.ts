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
 * audience. With a state filter (owner 2026-10-04: any set of states, a
 * user matches if any of their states is in it):
 *  - a client by the state of their profile;
 *  - an attorney by any of their licenses;
 *  - an assistant (audit 2026-10-02: they have neither, so a state filter
 *    used to reach nobody) by the licenses of an attorney whose team they
 *    are an active member of — they work that attorney's state.
 */
export function broadcastAudienceWhere(
  audience: BroadcastAudience,
  states?: string | readonly string[] | null,
): Prisma.UserWhereInput {
  const codes = [
    ...new Set(typeof states === 'string' ? [states] : (states ?? [])),
  ];
  // One state stays a plain equality (same query as before).
  const inStates = codes.length === 1 ? codes[0] : { in: codes };
  const byLicense: Prisma.AttorneyProfileWhereInput = {
    licenses: { some: { state_code: inStates } },
  };
  return {
    status: 'active',
    deleted_at: null,
    role: ROLE[audience] ?? { in: ['client', 'attorney', 'assistant'] },
    ...(codes.length
      ? {
          OR: [
            { client_profile: { state_code: inStates } },
            { attorney_profile: byLicense },
            {
              assistant_memberships: {
                some: {
                  status: 'active',
                  attorney: { attorney_profile: byLicense },
                },
              },
            },
          ],
        }
      : {}),
  };
}
