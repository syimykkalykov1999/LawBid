import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUTO_SCOPE } from './infra-auto.logic';

/**
 * Row 11 (15.11): a database server that an infra apply just created gets
 * its schema and runtime logins at once (prisma/migrate-shards.mjs in the
 * migrate task), not at the next deploy. Without that, ShardMoveService.
 * emptyServers could not read the new server, so «Авто» never removed an
 * empty one, and no data part could move to it.
 */
describe('infra-apply: migrate right after a database server switch', () => {
  const yml = readFileSync(
    join(__dirname, '../../../../../../.github/workflows/infra-apply.yml'),
    'utf8',
  );
  const step = yml.slice(yml.indexOf('- name: Migrate now'));
  const condition = step.slice(0, step.indexOf('run:'));

  it.each(
    Object.keys(AUTO_SCOPE).filter((id) => id.startsWith('aws.db_shards')),
  )('%s runs the migrate task after the apply', (id) => {
    expect(condition).toContain(`"${id}"`);
    expect(step).toContain('scripts/deploy/run-migrations.sh');
  });

  it('the partition login keeps its migrate run', () => {
    expect(condition).toContain('"aws.partition_role"');
  });
});
