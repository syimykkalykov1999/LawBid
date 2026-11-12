import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AI_FORBIDDEN_PATHS,
  checksState,
  forbiddenPaths,
  pullGuard,
  pullRefusal,
  pullSummary,
  type AiPullFacts,
} from './ai-pull-guard.logic';

/** The lines of one `NAME='…'` block of scripts/ai-assistant/path-guard.sh. */
function shellBlock(name: string): string[] {
  const sh = readFileSync(
    join(__dirname, '../../../../../scripts/ai-assistant/path-guard.sh'),
    'utf8',
  );
  const m = new RegExp(`\\n${name}='\\n([\\s\\S]*?)\\n'`).exec(sh);
  if (!m) throw new Error(`no ${name} block in path-guard.sh`);
  return m[1].split('\n').filter((l) => l !== '');
}

describe('AI pull guard (12.11.2026)', () => {
  it('is the same list as the workflow path guard (path-guard.sh)', () => {
    expect(shellBlock('FORBIDDEN')).toEqual([...AI_FORBIDDEN_PATHS]);
  });

  it('owner 12.11: any code by PR (money, migrations, admin, infra); walls only on CI, bootstrap IAM, keys, the guard and the rules', () => {
    expect(
      forbiddenPaths([
        'apps/api/src/modules/billing/billing.service.ts',
        'apps/api/src/modules/treasury/x.ts',
        'apps/api/prisma/migrations/1/migration.sql',
        'apps/api/src/modules/admin-auth/admin-auth.service.ts',
        'apps/api/src/modules/ai-assistant/ai-assistant.service.ts',
        'infra/envs/prod/iam.tf',
        'infra/modules/kms/main.tf',
        'apps/mobile/ios/Runner/AppDelegate.swift',
        'docs/dev/KNOWN_ERRORS.md',
      ]),
    ).toEqual([]);
    const bad = [
      '.github/workflows/deploy.yml',
      'infra/bootstrap/main.tf',
      'apps/api/.env',
      'apps/mobile/android/upload.jks',
      'apps/mobile/android/key.properties',
      'apps/mobile/ios/AuthKey_X.p8',
      'scripts/ai-assistant/path-guard.sh',
      'apps/api/src/modules/ai-assistant/ai-pull-guard.logic.ts',
      'CLAUDE.md',
      'AGENTS.md',
      'docs/dev/STRICT_RULES.md',
      '.claude/settings.json',
    ];
    expect(forbiddenPaths(bad)).toEqual([...bad].sort());
  });

  it('a rename out of a wall counts, a cut file list is refused', () => {
    expect(
      pullGuard(
        [
          {
            filename: 'docs/x.md',
            previousFilename: '.github/workflows/x.yml',
          },
          { filename: 'apps/api/src/modules/cases/ok.ts' },
        ],
        true,
      ),
    ).toEqual(['.github/workflows/x.yml']);
    expect(pullGuard([{ filename: 'a.ts' }], false)).toEqual([
      '(too many files to check)',
    ]);
  });

  it('green only when every check finished well', () => {
    const done = (conclusion: string) => ({ status: 'completed', conclusion });
    expect(checksState([], [])).toBe('none');
    expect(checksState([done('success'), done('skipped')], [])).toBe('success');
    expect(
      checksState(
        [done('success'), { status: 'in_progress', conclusion: null }],
        [],
      ),
    ).toBe('pending');
    expect(checksState([done('success'), done('cancelled')], [])).toBe(
      'failure',
    );
    expect(checksState([done('success')], [{ state: 'pending' }])).toBe(
      'pending',
    );
    expect(checksState([done('success')], [{ state: 'error' }])).toBe(
      'failure',
    );
  });

  it('merges only an open ai/ PR of this repository whose head the owner saw', () => {
    const sha = 'a'.repeat(40);
    const pr: AiPullFacts = {
      state: 'open',
      merged: false,
      draft: false,
      headRef: 'ai/issue-7',
      headRepo: 'O/R',
      baseRef: 'main',
      headSha: sha,
    };
    expect(pullRefusal(pr, 'o/r', sha.toUpperCase())).toBeNull();
    expect(pullRefusal({ ...pr, headRepo: 'evil/r' }, 'o/r', sha)).toBe(
      'not_ai',
    );
    expect(pullRefusal({ ...pr, headRef: 'feature/x' }, 'o/r', sha)).toBe(
      'not_ai',
    );
    expect(pullRefusal({ ...pr, baseRef: 'release' }, 'o/r', sha)).toBe(
      'not_ai',
    );
    expect(pullRefusal({ ...pr, state: 'closed' }, 'o/r', sha)).toBe(
      'not_open',
    );
    expect(pullRefusal({ ...pr, draft: true }, 'o/r', sha)).toBe('not_open');
    expect(pullRefusal(pr, 'o/r', 'b'.repeat(40))).toBe('stale_sha');
  });

  it('the summary is the PR body, cut', () => {
    expect(pullSummary('## What\r\nCrash\n')).toBe('## What\nCrash');
    expect(pullSummary(null)).toBe('');
    expect(pullSummary('x'.repeat(700))).toHaveLength(600);
  });
});
