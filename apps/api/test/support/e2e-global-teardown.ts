import { PrismaClient } from '@prisma/client';
import { baseUrls } from './e2e-env';

// Drops only the throwaway database this run created in globalSetup.
export default async function globalTeardown(): Promise<void> {
  const dbName = process.env.E2E_DATABASE_NAME;
  if (!dbName || !/^lawbid[a-z_]*e2e_\d+$/.test(dbName)) return;
  const admin = new PrismaClient({ datasourceUrl: baseUrls().databaseUrl });
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${dbName} CASCADE`);
  await admin.$disconnect();
}
