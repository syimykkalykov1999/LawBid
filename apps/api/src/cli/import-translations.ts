import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { unwrapKmsWrappedKeys } from '../common/secrets/kms-env';
import { AppModule } from '../app.module';
import {
  I18nImportService,
  type PreviousSeedValues,
} from '../modules/i18n/services/i18n-import.service';
import {
  loadEarlierSeedValues,
  loadSeedGrid,
} from '../modules/i18n/xlsx/seed-translations.util';

// `npm run i18n:import -- <folder|file.xlsx|file.csv>` (after `nest build`): the
// same import the admin's System → Localization page runs (docs/01 §9.3),
// without signing in. A folder is the built-in per-language JSON seed
// (prisma/seed/translations). Dry-run first; the file is applied only when the
// dry run reports no errors.
//
// `--missing-only` (every release, scripts/deploy/prod-admin-ecs.sh i18n):
// adds what the database lacks and never overwrites a text someone edited,
// such as the owner's uploads in Admin → Localization.
//
// KNOWN_ERRORS 271 (27.11): a text the SEED changed reaches the database too,
// "update only untouched" (Crowdin / Lokalise / Phrase): a cell that still
// holds an earlier seed text takes the new one. Earlier seed texts come from
//   `--update-from <folder>`  the running release's prisma/seed/translations
//                             (the deploy copies it out of the running image);
//   prisma/seed/translations-superseded.json  (next to the folder, read when
//                             present) the earlier texts of older releases.
async function run(): Promise<void> {
  // KMS-wrapped MESSAGE_ENC_KEYS / SECRETS_MASTER_KEYS entries → plaintext
  // in memory, before any module reads the config.
  await unwrapKmsWrappedKeys();
  const args = process.argv.slice(2);
  const path = args[0];
  if (!path) throw new Error('Usage: npm run i18n:import -- <file>');
  const missingOnly = args.includes('--missing-only');
  const fromAt = args.indexOf('--update-from');
  const updateFrom = fromAt >= 0 ? args[fromAt + 1] : undefined;
  if (fromAt >= 0 && (!updateFrom || updateFrom.startsWith('--'))) {
    throw new Error('--update-from needs the earlier seed folder');
  }
  const isDir = (await stat(path)).isDirectory();
  const buffer = isDir ? loadSeedGrid(path) : await readFile(path);

  let previousSeed: PreviousSeedValues | undefined;
  if (missingOnly && Array.isArray(buffer)) {
    const supersededFile = join(
      dirname(path.replace(/\/+$/, '')),
      'translations-superseded.json',
    );
    const oldSeedDir =
      updateFrom && existsSync(join(updateFrom, '_meta.json'))
        ? updateFrom
        : undefined;
    if (updateFrom && !oldSeedDir) {
      process.stdout.write(
        `earlier seed: ${updateFrom} has no _meta.json, only the known earlier texts are used\n`,
      );
    }
    const earlier = loadEarlierSeedValues(buffer, {
      oldSeedDir,
      supersededFile: existsSync(supersededFile) ? supersededFile : undefined,
    });
    previousSeed = earlier.values;
    process.stdout.write(
      `earlier seed texts: ${earlier.cells} cells (running release: ${oldSeedDir ? 'yes' : 'no'}, known earlier: ${existsSync(supersededFile) ? 'yes' : 'no'})\n`,
    );
  }
  const options = { missingOnly, previousSeed };

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const service = app.get(I18nImportService);
    const dry = await service.run(buffer, 'dry-run', options);
    process.stdout.write(`dry-run: ${JSON.stringify(dry).slice(0, 600)}\n`);
    const errors = (dry as { errors?: unknown[] }).errors ?? [];
    if (errors.length > 0) throw new Error('Dry run has errors, not applied.');
    const done = await service.run(buffer, 'apply', options);
    if (done.seedUpdate) {
      const { added, updated, keptEdited } = done.seedUpdate;
      process.stdout.write(
        `seed texts: added ${added}, updated ${updated} (untouched, still an earlier seed text), kept ${keptEdited} (edited, not the seed text)\n`,
      );
    }
    process.stdout.write(`applied: ${JSON.stringify(done).slice(0, 600)}\n`);
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
