/**
 * 26.11 (owner: «Хорошо, включить сейчас», SECOND_PASS D10): the nightly copy
 * of the public media in Cloudflare R2 into the versioned S3 bucket of
 * infra/bootstrap/media-backup.tf, run by .github/workflows/media-backup.yml.
 *
 * The owner only pastes a read-only R2 token in the admin (provider
 * `r2_backup`). The workflow asks the API with its GitHub Actions OIDC token
 * (audience lawbid-media-backup, this workflow file, main) what to do and
 * gets the token from here, so nothing is stored in GitHub; it reports the
 * result back, and «Запуск» shows «последняя копия: дата / объём / ошибка».
 *
 * Pure rules only (no Nest, no I/O): what a run should do, and the shape of
 * the stored result.
 */

export const MEDIA_BACKUP_WORKFLOW_FILE = 'media-backup.yml';
export const MEDIA_BACKUP_OIDC_AUDIENCE = 'lawbid-media-backup';
/** app_config row with the last results (LaunchChecksService reads it). */
export const MEDIA_BACKUP_STATE_KEY = 'ops.media_backup';

export interface MediaBackupResult {
  at: string;
  dryRun: boolean;
  ok: boolean;
  /** Files and bytes: of the copy after a real run, of the source in a dry run. */
  objects: number | null;
  bytes: number | null;
  /** Short reason on failure (never a key: rclone and AWS errors only). */
  error: string | null;
  runUrl: string | null;
}

export interface MediaBackupState {
  last: MediaBackupResult | null;
  lastOkDryRunAt: string | null;
  lastOkRunAt: string | null;
}

export const EMPTY_STATE: MediaBackupState = {
  last: null,
  lastOkDryRunAt: null,
  lastOkRunAt: null,
};

export type MediaBackupPlan =
  | { run: false; reason: 'no-keys' }
  | {
      run: true;
      dryRun: boolean;
      reason: 'asked-dry-run' | 'first-dry-run' | 'nightly';
    };

/**
 * What a run does: nothing without the admin's keys; a dry run when one is
 * asked for (the run started by «Включить») or no dry run / copy has ever
 * passed (the first night after the keys never copies blind); otherwise the
 * real copy.
 */
export function planRun(input: {
  keys: boolean;
  askedDryRun: boolean;
  state: MediaBackupState;
}): MediaBackupPlan {
  if (!input.keys) return { run: false, reason: 'no-keys' };
  if (input.askedDryRun) {
    return { run: true, dryRun: true, reason: 'asked-dry-run' };
  }
  if (!input.state.lastOkDryRunAt && !input.state.lastOkRunAt) {
    return { run: true, dryRun: true, reason: 'first-dry-run' };
  }
  return { run: true, dryRun: false, reason: 'nightly' };
}

/** The stored state after one reported run. */
export function withResult(
  state: MediaBackupState,
  r: MediaBackupResult,
): MediaBackupState {
  return {
    last: r,
    lastOkDryRunAt: r.ok && r.dryRun ? r.at : state.lastOkDryRunAt,
    lastOkRunAt: r.ok && !r.dryRun ? r.at : state.lastOkRunAt,
  };
}

/** Reads a stored row defensively (old / hand-edited values never throw). */
export function parseState(raw: unknown): MediaBackupState {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_STATE };
  const o = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  const num = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
  const l = o.last as Record<string, unknown> | null | undefined;
  const last: MediaBackupResult | null =
    l && typeof l === 'object' && typeof l.at === 'string'
      ? {
          at: l.at,
          dryRun: l.dryRun === true,
          ok: l.ok === true,
          objects: num(l.objects),
          bytes: num(l.bytes),
          error: str(l.error),
          runUrl: str(l.runUrl),
        }
      : null;
  return {
    last,
    lastOkDryRunAt: str(o.lastOkDryRunAt),
    lastOkRunAt: str(o.lastOkRunAt),
  };
}

/** AWS names of infra/bootstrap/media-backup.tf (local.name = lawbid-<env>). */
export function backupTargets(
  accountId: string,
  stackName: string,
): { roleArn: string; bucket: string } | null {
  if (!/^\d{12}$/.test(accountId) || !/^[a-z0-9-]{3,40}$/.test(stackName)) {
    return null;
  }
  return {
    roleArn: `arn:aws:iam::${accountId}:role/${stackName}-github-media-backup`,
    bucket: `${stackName}-media-backup-${accountId}`,
  };
}

/** "1.5 ГБ" / "320 МБ" for the owner. */
export function humanBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1).replace('.', ',')} ГБ`;
  const mb = bytes / 1024 ** 2;
  return `${Math.max(mb, 0)
    .toFixed(mb >= 10 ? 0 : 1)
    .replace('.', ',')} МБ`;
}
