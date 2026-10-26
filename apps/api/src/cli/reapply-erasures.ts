import { NestFactory } from '@nestjs/core';
import { unwrapKmsWrappedKeys } from '../common/secrets/kms-env';
import { AppModule } from '../app.module';
import { AccountAnonymizationService } from '../modules/privacy/account-anonymization.service';
import { ErasureLedgerService } from '../modules/privacy/erasure-ledger.service';

// `npm run privacy:reapply-erasures` (after `nest build`): the step that
// follows EVERY database restore (docs/runbooks/backups.md). A restore
// brings back people who were erased after the restore point; this finds
// every id in the erasure ledger (table + bucket objects) whose user row is
// not anonymized and anonymizes it again. DRY_RUN=1 only counts. Prints
// counts and opaque ids, never names or contacts.
async function run(): Promise<void> {
  await unwrapKmsWrappedKeys();
  const dry = process.env.DRY_RUN === '1';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const ids = await app.get(ErasureLedgerService).resurrected();
    process.stdout.write(`${ids.length} erased people are back in the data.\n`);
    if (dry) return;
    const anonymizer = app.get(AccountAnonymizationService);
    let done = 0;
    for (const id of ids) {
      if (await anonymizer.anonymize(id, new Date(), 'restore_reapply')) {
        done += 1;
      } else {
        process.stdout.write(`not erased (legal hold or missing): ${id}\n`);
      }
    }
    process.stdout.write(`${done} anonymized again.\n`);
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
