// Types of prisma/pg-client.mjs (used by src/prisma/pg-adapter.spec.ts).
import type { ClientConfig } from 'pg';

export function pgClientConfig(raw: string): ClientConfig;

export interface RawClient {
  $queryRawUnsafe<T = Record<string, unknown>>(
    sql: string,
    ...params: unknown[]
  ): Promise<T[]>;
  $executeRawUnsafe(sql: string, ...params: unknown[]): Promise<number>;
  $disconnect(): Promise<void>;
}

export function rawClient(url: string | undefined): RawClient;
