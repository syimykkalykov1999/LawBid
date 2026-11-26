import type { ITXClientDenyList } from '@prisma/client/runtime/client';
import { PrismaClient } from '../generated/prisma/client';
import type {
  AdminCredential,
  AssistantMembership,
  CalendarConnection,
  DemoAccount,
  OutreachLead,
  Session,
  StateBarRegistry,
  User,
} from '../generated/prisma/client';
import { pgAdapter } from './pg-adapter';

/**
 * ASVS 5.0 V8.2.3 / V15.3.1, OWASP API3 (STAGE2_SECURITY S10, #17): secret
 * columns never leave Prisma by default.
 *
 * Prisma's own global `omit` (prisma.io/docs/orm/prisma-client/queries/excluding-fields,
 * GA since 6.2) drops these columns from the result of every query of the
 * clients built with it: findMany, findUnique, create, update, upsert, the
 * rows an `include` brings, and the clients of `$transaction` and `$extends`.
 * A reader that really needs one (the password check, TOTP verify, recovery,
 * token rotation, the key re-encryption job) asks for it explicitly with
 * `select: { <column>: true }` or `omit: { <column>: false }`; the compiler
 * knows the column is absent otherwise, so a forgotten select can no longer
 * put a password hash or an encrypted key into an answer, a log line or a
 * cache entry.
 *
 * Filters (`where: { token_hash }`) and writes (`data: { password_hash }`)
 * are not affected: omit only shapes what comes back. Hand-written SQL
 * (`$queryRaw`) is not affected either.
 *
 * secret-columns.spec.ts keeps this list in sync with schema.prisma: a new
 * column whose name looks secret must be added here or to
 * NOT_SECRET_COLUMNS there with a reason.
 */
export const SECRET_COLUMNS_OMIT = {
  user: { password_hash: true },
  session: { refresh_hash: true },
  adminCredential: {
    password_hash: true,
    security_answer_hash: true,
    totp_secret_enc: true,
    recovery_codes_hash: true,
  },
  integrationCredential: { secret_enc: true },
  stateBarRegistry: { secret_enc: true },
  calendarConnection: { refresh_token_enc: true },
  assistantMembership: { join_code_enc: true, join_code_hash: true },
  calendarFeedToken: { token_hash: true },
  demoAccount: { invite_code_hash: true },
  outreachLead: { unsubscribe_token_hash: true },
} as const;

/** The options type every application client is built with. */
export type SecretOmittingOptions = {
  adapter: ReturnType<typeof pgAdapter>;
  omit: typeof SECRET_COLUMNS_OMIT;
};

/** A Prisma client that leaves the secret columns out unless asked. */
export type SecretOmittingClient = PrismaClient<
  never,
  typeof SECRET_COLUMNS_OMIT
>;

/**
 * The client a `$transaction(async (tx) => ...)` callback gets from it: the
 * application's own `Prisma.TransactionClient`. Prisma's generated
 * `Prisma.TransactionClient` is typed WITHOUT the global omit, so it would
 * claim a secret column is in a result it is not in (secret-columns.spec.ts
 * keeps it out of the code).
 */
export type DbTx = Omit<SecretOmittingClient, ITXClientDenyList>;

/**
 * A raw client of one physical database with the secret columns omitted
 * (the primary's shard and demo clients, the read copies).
 */
export function newSecretOmittingClient(
  adapter: ReturnType<typeof pgAdapter>,
): SecretOmittingClient {
  return new PrismaClient({ adapter, omit: SECRET_COLUMNS_OMIT });
}

type Omitted<M extends keyof typeof SECRET_COLUMNS_OMIT> =
  keyof (typeof SECRET_COLUMNS_OMIT)[M];

/** A row as a plain read returns it: without its secret columns. */
export type UserRow = Omit<User, Omitted<'user'>>;
export type SessionRow = Omit<Session, Omitted<'session'>>;
export type AdminCredentialRow = Omit<
  AdminCredential,
  Omitted<'adminCredential'>
>;
export type StateBarRegistryRow = Omit<
  StateBarRegistry,
  Omitted<'stateBarRegistry'>
>;
export type CalendarConnectionRow = Omit<
  CalendarConnection,
  Omitted<'calendarConnection'>
>;
export type AssistantMembershipRow = Omit<
  AssistantMembership,
  Omitted<'assistantMembership'>
>;
export type DemoAccountRow = Omit<DemoAccount, Omitted<'demoAccount'>>;
export type OutreachLeadRow = Omit<OutreachLead, Omitted<'outreachLead'>>;
