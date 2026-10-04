import { readFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { I18nImportService } from '../modules/i18n/services/i18n-import.service';

// `npm run i18n:import -- <file.xlsx|file.csv>` (after `nest build`): the
// same import the admin's System → Localization page runs (docs/01 §9.3),
// without signing in. Dry-run first; the file is applied only when the
// dry run reports no errors.
async function run(): Promise<void> {
  const path = process.argv[2];
  if (!path) throw new Error('Usage: npm run i18n:import -- <file>');
  const buffer = await readFile(path);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const service = app.get(I18nImportService);
    const dry = await service.run(buffer, 'dry-run');
    process.stdout.write(`dry-run: ${JSON.stringify(dry).slice(0, 600)}\n`);
    const errors = (dry as { errors?: unknown[] }).errors ?? [];
    if (errors.length > 0) throw new Error('Dry run has errors, not applied.');
    const done = await service.run(buffer, 'apply');
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
