import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  backupTargets,
  EMPTY_STATE,
  humanBytes,
  parseState,
  planRun,
  withResult,
  type MediaBackupResult,
} from './media-backup.logic';

const result = (over: Partial<MediaBackupResult>): MediaBackupResult => ({
  at: '2026-11-27T11:40:00.000Z',
  dryRun: false,
  ok: true,
  objects: 10,
  bytes: 2048,
  error: null,
  runUrl: 'https://github.com/o/r/actions/runs/1',
  ...over,
});

describe('media backup rules (26.11, D10)', () => {
  it('no keys in the admin: the run does nothing', () => {
    expect(
      planRun({ keys: false, askedDryRun: true, state: EMPTY_STATE }),
    ).toEqual({ run: false, reason: 'no-keys' });
  });

  it('the first run after the keys is always a dry run, also at night', () => {
    expect(
      planRun({ keys: true, askedDryRun: false, state: EMPTY_STATE }),
    ).toEqual({ run: true, dryRun: true, reason: 'first-dry-run' });
  });

  it('after a passed dry run the night copies for real; an asked dry run stays dry', () => {
    const s = withResult(EMPTY_STATE, result({ dryRun: true }));
    expect(planRun({ keys: true, askedDryRun: false, state: s })).toEqual({
      run: true,
      dryRun: false,
      reason: 'nightly',
    });
    expect(planRun({ keys: true, askedDryRun: true, state: s }).run).toBe(true);
    expect(
      (
        planRun({ keys: true, askedDryRun: true, state: s }) as {
          dryRun: boolean;
        }
      ).dryRun,
    ).toBe(true);
  });

  it('a failed dry run does not unlock the real copy', () => {
    const s = withResult(EMPTY_STATE, result({ dryRun: true, ok: false }));
    expect(s.lastOkDryRunAt).toBeNull();
    expect(planRun({ keys: true, askedDryRun: false, state: s }).reason).toBe(
      'first-dry-run',
    );
  });

  it('keeps the last good copy date when a later night fails', () => {
    const good = withResult(EMPTY_STATE, result({}));
    const bad = withResult(
      good,
      result({ ok: false, at: '2026-11-28T11:40:00.000Z', error: 'x' }),
    );
    expect(bad.lastOkRunAt).toBe('2026-11-27T11:40:00.000Z');
    expect(bad.last?.ok).toBe(false);
  });

  it('reads stored rows defensively', () => {
    expect(parseState(null)).toEqual(EMPTY_STATE);
    expect(parseState('x')).toEqual(EMPTY_STATE);
    expect(parseState({ last: { at: 1 } }).last).toBeNull();
    const back = parseState(
      JSON.parse(JSON.stringify(withResult(EMPTY_STATE, result({})))),
    );
    expect(back.last?.objects).toBe(10);
    expect(back.lastOkRunAt).toBe('2026-11-27T11:40:00.000Z');
  });

  it('builds the bootstrap names (infra/bootstrap/media-backup.tf) and refuses odd input', () => {
    expect(backupTargets('123456789012', 'lawbid-prod')).toEqual({
      roleArn: 'arn:aws:iam::123456789012:role/lawbid-prod-github-media-backup',
      bucket: 'lawbid-prod-media-backup-123456789012',
    });
    expect(backupTargets('', 'lawbid-prod')).toBeNull();
    expect(backupTargets('123456789012', 'Bad Name')).toBeNull();
  });

  it('the names match the Terraform of the bootstrap', () => {
    const tf = readFileSync(
      join(__dirname, '../../../../../infra/bootstrap/media-backup.tf'),
      'utf8',
    );
    expect(tf).toMatch(/name\s+= "\$\{local\.name\}-github-media-backup"/);
    expect(tf).toMatch(
      /bucket = "\$\{local\.name\}-media-backup-\$\{local\.account\}"/,
    );
  });

  it('shows sizes in plain units', () => {
    expect(humanBytes(1.5 * 1024 ** 3)).toBe('1,5 ГБ');
    expect(humanBytes(320 * 1024 ** 2)).toBe('320 МБ');
    expect(humanBytes(0)).toBe('0,0 МБ');
  });
});
