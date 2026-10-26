import { NestFactory } from '@nestjs/core';
import { unwrapKmsWrappedKeys } from '../common/secrets/kms-env';
import { AppModule } from '../app.module';
import { RankingReplayService } from '../modules/experiments/ranking-replay';

// `node dist/src/cli/ranking-replay.js --surface=people
//   --weights='{"contact":0.3,"state":0.1,...}' [--days=14] [--k=10]`
// Re-scores the saved impressions of a surface with new weights and prints
// NDCG@k of the old order and the new one (docs/architecture/EXPERIMENTS.md).
// Read-only. Run it before turning a ranking change on.
function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

async function run(): Promise<void> {
  const surface = arg('surface');
  const weightsRaw = arg('weights');
  if (!surface || !weightsRaw) {
    throw new Error(
      'usage: --surface=<name> --weights=\'{"feature":0.5,...}\' [--days=14] [--k=10]',
    );
  }
  const weights = JSON.parse(weightsRaw) as Record<string, number>;
  await unwrapKmsWrappedKeys();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const r = await app.get(RankingReplayService).replay({
      surface,
      days: Number(arg('days') ?? 14),
      k: Number(arg('k') ?? 10),
      weights,
    });
    process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
  } finally {
    await app.close();
  }
}

run().then(
  () => process.exit(0),
  (err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : 'failed'}\n`);
    process.exit(1);
  },
);
