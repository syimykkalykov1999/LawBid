import type {
  ITXClientDenyList,
  UnwrapTuple,
} from '@prisma/client/runtime/client';
import { Prisma, PrismaClient } from '../generated/prisma/client';
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

/** Prisma's own client type with the global omit (delegates, `$extends`). */
type OmittingBase = PrismaClient<never, typeof SECRET_COLUMNS_OMIT>;

type TxOptions = {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
};

/**
 * A Prisma client that leaves the secret columns out unless asked.
 *
 * Prisma 7's generated `$transaction(fn)` hands `fn` the DEFAULT client type
 * (`Omit<PrismaClient, ITXClientDenyList>`, no global omit), so a callback's
 * `tx` would claim the secret columns are there, and every `tx` passed on to
 * a `DbTx` helper made tsc build and compare a second full copy of the
 * generated delegate types (#1345: 2.4M -> 4.8M types, lint OOM). The one
 * method is re-typed here so every client, transaction and helper uses this
 * single omit-typed tree.
 */
export interface SecretOmittingClient extends Omit<
  OmittingBase,
  '$transaction'
> {
  $transaction<P extends Prisma.PrismaPromise<unknown>[]>(
    arg: [...P],
    options?: TxOptions,
  ): Promise<UnwrapTuple<P>>;
  $transaction<R>(
    fn: (tx: DbTx) => Promise<R>,
    options?: TxOptions,
  ): Promise<R>;
}

/**
 * The client a `$transaction(async (tx) => ...)` callback gets: the
 * application's own `Prisma.TransactionClient`. Prisma's generated
 * `Prisma.TransactionClient` is typed WITHOUT the global omit, so it would
 * claim a secret column is in a result it is not in (secret-columns.spec.ts
 * keeps it out of the code).
 */
export type DbTx = Omit<SecretOmittingClient, ITXClientDenyList>;

/**
 * The PrismaClient class typed as SecretOmittingClient. The class goes
 * through `unknown` first on purpose: relating Prisma's own constructor type
 * to this one (a checked cast, or the lint rule no-unnecessary-type-assertion
 * looking at `PrismaClient as ...`) makes the checker expand the default and
 * the omit-typed delegate trees, +2.6M types and an eslint heap OOM (#1345,
 * KNOWN_ERRORS 256). The runtime class is Prisma's own; only the type is
 * narrowed.
 */
const prismaClientClass: unknown = PrismaClient;
export const SecretOmittingPrismaClient = prismaClientClass as new (
  options: Prisma.PrismaClientOptions & {
    adapter: ReturnType<typeof pgAdapter>;
    omit: typeof SECRET_COLUMNS_OMIT;
  },
) => SecretOmittingClient;

/**
 * A raw client of one physical database with the secret columns omitted
 * (the primary's shard and demo clients, the read copies).
 */
export function newSecretOmittingClient(
  adapter: ReturnType<typeof pgAdapter>,
): SecretOmittingClient {
  return new SecretOmittingPrismaClient({ adapter, omit: SECRET_COLUMNS_OMIT });
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
