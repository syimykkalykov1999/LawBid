import { NestFactory } from '@nestjs/core';
import { unwrapKmsWrappedKeys } from '../common/secrets/kms-env';
import { AppModule } from '../app.module';
import {
  ReindexRefused,
  SearchReindexService,
} from '../modules/search/search-reindex.service';

// Zero-downtime search reindex (owner 2026-10-25), same engine as the admin
// «Масштаб» buttons. After `nest build`:
//   node dist/src/cli/search-alias.js status
//   node dist/src/cli/search-alias.js start [--source=postgres|engine]
//   node dist/src/cli/search-alias.js run      (build until done, resumable)
//   node dist/src/cli/search-alias.js verify
//   node dist/src/cli/search-alias.js swap     (read alias, then write alias)
//   node dist/src/cli/search-alias.js rollback (cancel / go back)
// See docs/runbooks/search-reindex.md.
function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

async function run(): Promise<void> {
  const cmd = process.argv[2];
  if (!['status', 'start', 'run', 'verify', 'swap', 'rollback'].includes(cmd)) {
    throw new Error(
      'usage: search-alias <status|start|run|verify|swap|rollback>',
    );
  }
  await unwrapKmsWrappedKeys();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const svc = app.get(SearchReindexService);
    const out = (v: unknown) =>
      process.stdout.write(`${JSON.stringify(v, null, 2)}\n`);
    try {
      switch (cmd) {
        case 'status':
          out(await svc.status());
          break;
        case 'start': {
          const source = arg('source') === 'engine' ? 'engine' : 'postgres';
          out(await svc.start(source));
          break;
        }
        case 'run': {
          let last = '';
          for (;;) {
            const s = await svc.step(10_000);
            const line = `${s?.phase ?? '-'} ${s?.progress.entity ?? '-'} ${s?.progress.indexed ?? 0}`;
            if (line !== last) process.stdout.write(`${line}\n`);
            last = line;
            if (s?.error) process.stderr.write(`${s.error}\n`);
            if (!s || s.phase !== 'building') break;
          }
          out(await svc.verify());
          break;
        }
        case 'verify':
          out(await svc.verify());
          break;
        case 'swap':
          out(await svc.swap());
          break;
        case 'rollback':
          out(await svc.rollback());
          break;
      }
    } catch (e) {
      if (e instanceof ReindexRefused) throw new Error(e.message);
      throw e;
    }
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
