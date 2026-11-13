/**
 * 12.11.2026 (owner): the AI assistant works like the foreman. It watches the
 * system and opens fix PRs; the owner presses «Разрешить» (2FA) and only then
 * the API merges. Before a merge the API re-runs the same path guard the
 * workflow runs (scripts/ai-assistant/path-guard.sh) on the PR's changed
 * files, read from GitHub — the workflow's own check could be skipped or
 * raced by a later push. The lists below are the shell script's, one to one;
 * ai-pull-guard.logic.spec.ts reads the script and fails if they drift.
 */

/**
 * Hard walls (owner 12.11: everything else may change by PR, money modules,
 * migrations, admin and infra code included; the owner's «Разрешить» with
 * 2FA is the gate). POSIX ERE, the same lines as path-guard.sh:
 * CI workflows (they run with the repository's secrets before approval),
 * bootstrap IAM (applied by hand), real secrets and store/signing keys,
 * this guard itself and the rule files.
 */
export const AI_FORBIDDEN_PATHS: readonly string[] = [
  '^\\.github/',
  '^infra/bootstrap',
  '(^|/)\\.env',
  '\\.(jks|keystore|p12|p8|mobileprovision|pem|key)$',
  '(^|/)key\\.properties$',
  '^scripts/ai-assistant/',
  '^apps/api/src/modules/ai-assistant/ai-pull-guard\\.logic(\\.spec)?\\.ts$',
  '(^|/)CLAUDE\\.md$',
  '^AGENTS\\.md$',
  '^docs/dev/STRICT_RULES\\.md$',
  '^\\.claude/',
  // Owner 2026-11-12: the owner's task pictures on the runner never go in.
  '^\\.ai-attachments/',
];

const FORBIDDEN = AI_FORBIDDEN_PATHS.map((p) => new RegExp(p));

/** Pure: the forbidden ones among [paths] (sorted, unique). */
export function forbiddenPaths(paths: readonly string[]): string[] {
  return [
    ...new Set(paths.filter((p) => p && FORBIDDEN.some((r) => r.test(p)))),
  ].sort();
}

/** One changed file of a PR, as GitHub's «list pull request files» gives it. */
export interface PullFile {
  filename: string;
  previousFilename?: string | null;
}

/**
 * Pure: what in a PR breaks the walls. Renames count with the old path too
 * (moving a key file out is still touching it). Fail closed: a PR GitHub
 * listed only in part is refused.
 */
export function pullGuard(
  files: readonly PullFile[],
  complete: boolean,
): string[] {
  const bad = forbiddenPaths(
    files.flatMap((f) =>
      f.previousFilename ? [f.filename, f.previousFilename] : [f.filename],
    ),
  );
  return complete ? bad : [...bad, '(too many files to check)'];
}

export type ChecksState = 'success' | 'pending' | 'failure' | 'none';

/**
 * Pure: the CI state of a commit from its check runs and commit statuses.
 * Green only when there is at least one check and every one has finished as
 * success / skipped / neutral. Anything still running = pending; any other
 * end (failure, cancelled, timed_out, action_required, stale) = failure.
 */
export function checksState(
  runs: readonly { status: string; conclusion: string | null }[],
  statuses: readonly { state: string }[],
): ChecksState {
  if (runs.length === 0 && statuses.length === 0) return 'none';
  const ok = new Set(['success', 'skipped', 'neutral']);
  let pending = false;
  for (const r of runs) {
    if (r.status !== 'completed') pending = true;
    else if (!ok.has(r.conclusion ?? '')) return 'failure';
  }
  for (const s of statuses) {
    if (s.state === 'failure' || s.state === 'error') return 'failure';
    if (s.state !== 'success') pending = true;
  }
  return pending ? 'pending' : 'success';
}

/** Branches the AI assistant pushes (workflow: ai/issue-N, ai/scheduled-N). */
export const AI_BRANCH_PREFIX = 'ai/';

export type AiPullRefusal =
  | 'not_found'
  | 'not_ai'
  | 'not_open'
  | 'stale_sha'
  | 'checks'
  | 'guard'
  | 'busy'
  | 'not_connected'
  | 'merge_failed';

export const AI_PULL_REFUSAL_TEXT: Record<AiPullRefusal, string> = {
  not_found: 'Такого PR нет.',
  not_ai: 'Это не PR ИИ-помощника (ветка ai/… в этом же репозитории).',
  not_open: 'PR уже закрыт или влит.',
  stale_sha:
    'В PR появились новые изменения после того, как вы его открыли. Обновите страницу и посмотрите ещё раз.',
  checks: 'Проверки CI ещё не зелёные. Влить можно только после зелёного CI.',
  guard: 'PR меняет запрещённые для ИИ файлы.',
  busy: 'Сейчас уже вливается другой PR ИИ. Подождите минуту.',
  not_connected:
    'Не подключено: нет GitHub-приложения в «Ключи и сервисы» (github_infra).',
  merge_failed: 'GitHub не дал влить PR.',
};

/** What the approve step knows about the PR, read fresh from GitHub. */
export interface AiPullFacts {
  state: string;
  merged: boolean;
  draft: boolean;
  headRef: string;
  headRepo: string;
  baseRef: string;
  headSha: string;
}

/**
 * Pure: may the owner's «Разрешить» merge this PR? Only an open, non-draft
 * PR into main from an `ai/` branch of THIS repository (a fork may name its
 * branch ai/… too), whose head is still the commit the owner saw.
 */
export function pullRefusal(
  pr: AiPullFacts,
  repo: string,
  seenSha: string,
): AiPullRefusal | null {
  if (
    !pr.headRef.startsWith(AI_BRANCH_PREFIX) ||
    pr.headRepo.toLowerCase() !== repo.toLowerCase() ||
    pr.baseRef !== 'main'
  ) {
    return 'not_ai';
  }
  if (pr.state !== 'open' || pr.merged || pr.draft) return 'not_open';
  if (pr.headSha.toLowerCase() !== seenSha.toLowerCase()) return 'stale_sha';
  return null;
}

/** Pure: «what / why» for the admin row: the PR body, cut and one line each. */
export function pullSummary(body: string | null | undefined, max = 600) {
  const text = (body ?? '').replace(/\r/g, '').trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
