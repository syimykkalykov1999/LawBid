import { NestFactory } from '@nestjs/core';
import { unwrapKmsWrappedKeys } from '../common/secrets/kms-env';
import { assertNoRecreate } from './search-reindex-guard';
import { AppModule } from '../app.module';
import { SearchIndexerService } from '../modules/search/search-indexer.service';
import { OpenSearchClient } from '../modules/search/engine/opensearch.client';
import {
  SEARCH_ENTITIES,
  isSearchEntity,
} from '../modules/search/engine/search-engine.mappings';

// `node dist/src/cli/search-reindex.js [--entity=case] [--batch=500]
//   [--restart] [--recreate] [--sync]` (after `nest build`): fills the search
// engine from the database in batches. Resumable: stop it any time and run
// it again, it continues from the checkpoint (search_index_state).
//   --entity    only person | case | post | question | tag
//   --batch     rows per round trip (default 500)
//   --restart   forget the checkpoint, walk everything again
//   --recreate  REFUSED (would drop the live index): use search-alias.js
//   --sync      also delete documents of rows that are no longer searchable
// Run it AFTER setting `search.engine` to shadow (so changes made while it
// runs are captured by the outbox), though the API's own indexer job does
// the same fill by itself within minutes.
function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function run(): Promise<void> {
  assertNoRecreate(process.argv);
  await unwrapKmsWrappedKeys();
  const entityArg = arg('entity');
  if (entityArg && !isSearchEntity(entityArg)) {
    throw new Error(`--entity must be one of ${SEARCH_ENTITIES.join(', ')}`);
  }
  const entity = entityArg && isSearchEntity(entityArg) ? entityArg : undefined;
  const batch = Number(arg('batch') ?? 500);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const client = app.get(OpenSearchClient);
    if (!(await client.isConfigured())) {
      throw new Error(
        'The search engine address is not set (Integrations → Search engine, or OPENSEARCH_URL).',
      );
    }
    const indexer = app.get(SearchIndexerService);
    if (flag('restart')) {
      await indexer.resetReindex(entity);
    }
    let last = -1;
    for (;;) {
      const st = await indexer.reindex({
        batch,
        budgetMs: 10_000,
        entity,
        deleteMissing: flag('sync'),
      });
      if (st.indexed !== last) {
        process.stdout.write(
          `${st.done ? 'done' : (st.entity ?? '-')}: ${st.indexed} documents\n`,
        );
        last = st.indexed;
      }
      if (st.done) break;
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
