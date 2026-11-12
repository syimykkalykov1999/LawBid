import { Injectable, Logger } from '@nestjs/common';
import { createPrivateKey } from 'node:crypto';
import { SignJWT, createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { SecretsService } from '../../../common/secrets/secrets.service';

/** The workflow file the API may start, and the only one it trusts. */
export const INFRA_WORKFLOW_FILE = 'infra-apply.yml';
/** The public pages + company site build («Продвижение» dry runs; owner
 * 2026-11-04 R-399: a saved price starts it for real). */
export const SEO_WORKFLOW_FILE = 'seo-deploy.yml';
/** Other workflows the API may start (the caller picks the inputs). */
export const DISPATCHABLE_WORKFLOWS: readonly string[] = [SEO_WORKFLOW_FILE];
/** Audience the workflow asks GitHub for when it calls the API. */
export const INFRA_OIDC_AUDIENCE = 'lawbid-infra-apply';
const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const GH_API = 'https://api.github.com';

export interface WorkflowCaller {
  runId: string;
  runUrl: string;
}

export class InfraAuthError extends Error {}

/**
 * Owner 2026-10-26: the only two ways the API talks to GitHub for infra
 * switches.
 *
 * 1. dispatch(): a GitHub App installation token (1 hour) narrowed to
 *    `actions: write` on THIS repository only starts `infra-apply.yml` on
 *    main with one input, the request id. No personal token; the App key
 *    lives in the Integrations vault (provider `github_infra`).
 * 2. verifyCaller(): the workflow calls back with a GitHub Actions OIDC
 *    token (audience `lawbid-infra-apply`). The API checks GitHub's
 *    signature (JWKS), the repository, that the job runs THIS workflow file
 *    from refs/heads/main, and takes the run id from the token. No shared
 *    secret exists that could leak from the public repository.
 */
@Injectable()
export class InfraGithubClient {
  private readonly log = new Logger(InfraGithubClient.name);
  private readonly jwks = createRemoteJWKSet(
    new URL(`${GITHUB_OIDC_ISSUER}/.well-known/jwks`),
  );

  constructor(private readonly secrets: SecretsService) {}

  private async creds(): Promise<{
    repo: string;
    appId: string;
    installationId: string;
    privateKey: string;
  } | null> {
    const f = (await this.secrets.get('github_infra'))?.fields;
    if (!f?.repo || !f.appId || !f.installationId || !f.privateKey) {
      return null;
    }
    return {
      repo: f.repo,
      appId: f.appId,
      installationId: f.installationId,
      privateKey: f.privateKey,
    };
  }

  async configured(): Promise<boolean> {
    try {
      return (await this.creds()) !== null;
    } catch {
      return false;
    }
  }

  /** The 1-hour installation token, narrowed to [permissions] (default
   * actions:write) on one repo. */
  private async installationToken(
    c: {
      repo: string;
      appId: string;
      installationId: string;
      privateKey: string;
    },
    permissions: Record<string, 'read' | 'write'> = { actions: 'write' },
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const appJwt = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(c.appId)
      .setIssuedAt(now - 60)
      .setExpirationTime(now + 9 * 60)
      .sign(createPrivateKey(c.privateKey));
    const res = await fetch(
      `${GH_API}/app/installations/${encodeURIComponent(c.installationId)}/access_tokens`,
      {
        method: 'POST',
        headers: this.headers(appJwt),
        body: JSON.stringify({
          repositories: [c.repo.split('/')[1]],
          permissions,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) {
      throw new Error(`GitHub refused the App token (HTTP ${res.status})`);
    }
    const body = (await res.json()) as { token?: string };
    if (!body.token) throw new Error('GitHub sent no App token');
    return body.token;
  }

  private headers(bearer: string): Record<string, string> {
    return {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${bearer}`,
      'content-type': 'application/json',
      'user-agent': 'lawbid-infra',
      'x-github-api-version': '2022-11-28',
    };
  }

  /** Starts infra-apply.yml on main for [requestId]. Throws on failure. */
  async dispatch(requestId: string): Promise<void> {
    const c = await this.creds();
    if (!c) throw new Error('GitHub App is not configured');
    const token = await this.installationToken(c);
    const res = await fetch(
      `${GH_API}/repos/${c.repo}/actions/workflows/${INFRA_WORKFLOW_FILE}/dispatches`,
      {
        method: 'POST',
        headers: this.headers(token),
        body: JSON.stringify({
          ref: 'main',
          inputs: { request_id: requestId },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (res.status !== 204 && res.status !== 200) {
      throw new Error(`GitHub did not start the workflow (HTTP ${res.status})`);
    }
    this.log.log(`infra-apply dispatched for request ${requestId}`);
  }

  /**
   * Owner 2026-10-27 («Продвижение»): starts one of DISPATCHABLE_WORKFLOWS on
   * main with [inputs] (string values). Returns the repository so the admin
   * can link to the run list. Throws on failure.
   */
  async dispatchWorkflow(
    file: string,
    inputs: Record<string, string>,
  ): Promise<{ repo: string }> {
    if (!DISPATCHABLE_WORKFLOWS.includes(file)) {
      throw new Error(`workflow ${file} is not allowed`);
    }
    const c = await this.creds();
    if (!c) throw new Error('GitHub App is not configured');
    const token = await this.installationToken(c);
    const res = await fetch(
      `${GH_API}/repos/${c.repo}/actions/workflows/${file}/dispatches`,
      {
        method: 'POST',
        headers: this.headers(token),
        body: JSON.stringify({ ref: 'main', inputs }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (res.status !== 204 && res.status !== 200) {
      throw new Error(`GitHub did not start the workflow (HTTP ${res.status})`);
    }
    this.log.log(`${file} dispatched`);
    return { repo: c.repo };
  }

  /**
   * Checks the workflow's OIDC token; returns the run it came from.
   * Throws InfraAuthError on anything else.
   */
  async verifyCaller(
    authorization: string | undefined,
    workflow: { file: string; audience: string } = {
      file: INFRA_WORKFLOW_FILE,
      audience: INFRA_OIDC_AUDIENCE,
    },
  ): Promise<WorkflowCaller> {
    const token = /^Bearer\s+(\S+)$/i.exec(authorization ?? '')?.[1];
    if (!token) throw new InfraAuthError('no token');
    const c = await this.creds();
    if (!c) throw new InfraAuthError('not configured');
    let payload: JWTPayload;
    try {
      payload = (
        await jwtVerify(token, this.jwks, {
          issuer: GITHUB_OIDC_ISSUER,
          audience: workflow.audience,
        })
      ).payload;
    } catch {
      throw new InfraAuthError('bad token');
    }
    return callerFromClaims(payload, c.repo, workflow.file);
  }

  /**
   * 09.11 (AI assistant): opens an issue with [labels] on the App's repo.
   * The App needs Issues: read and write. Returns its number and link.
   */
  async createIssue(input: {
    title: string;
    body: string;
    labels: string[];
  }): Promise<{ number: number; url: string; repo: string }> {
    const c = await this.creds();
    if (!c) throw new Error('GitHub App is not configured');
    const token = await this.installationToken(c, { issues: 'write' });
    const res = await fetch(`${GH_API}/repos/${c.repo}/issues`, {
      method: 'POST',
      headers: this.headers(token),
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status !== 201) {
      throw new Error(`GitHub did not open the issue (HTTP ${res.status})`);
    }
    const body = (await res.json()) as { number?: number; html_url?: string };
    if (typeof body.number !== 'number' || !body.html_url) {
      throw new Error('GitHub sent no issue number');
    }
    return { number: body.number, url: body.html_url, repo: c.repo };
  }

  /**
   * The newest issues with [label] and, for each, the pull requests that
   * mention it (GitHub search «#<n> in:body»). Read-only token (issues +
   * pull requests: read). At most [limit] issues, one search call each.
   */
  async issuesWithPulls(
    label: string,
    limit = 20,
  ): Promise<
    {
      number: number;
      title: string;
      state: string;
      url: string;
      createdAt: string;
      pulls: { number: number; url: string; state: string; merged: boolean }[];
    }[]
  > {
    const c = await this.creds();
    if (!c) throw new Error('GitHub App is not configured');
    const token = await this.installationToken(c, {
      issues: 'read',
      pull_requests: 'read',
    });
    const res = await fetch(
      `${GH_API}/repos/${c.repo}/issues?labels=${encodeURIComponent(label)}&state=all&per_page=${limit}`,
      { headers: this.headers(token), signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok)
      throw new Error(`GitHub issues list failed (HTTP ${res.status})`);
    const rows = (await res.json()) as {
      number: number;
      title: string;
      state: string;
      html_url: string;
      created_at: string;
      pull_request?: unknown;
    }[];
    const out = [];
    for (const r of rows.filter((x) => !x.pull_request)) {
      const q = `repo:${c.repo} is:pr "#${r.number}" in:body`;
      const s = await fetch(
        `${GH_API}/search/issues?q=${encodeURIComponent(q)}&per_page=5`,
        { headers: this.headers(token), signal: AbortSignal.timeout(10_000) },
      );
      const found = s.ok
        ? ((await s.json()) as {
            items?: {
              number: number;
              html_url: string;
              state: string;
              pull_request?: { merged_at?: string | null };
            }[];
          })
        : { items: [] };
      out.push({
        number: r.number,
        title: r.title,
        state: r.state,
        url: r.html_url,
        createdAt: r.created_at,
        pulls: (found.items ?? []).map((p) => ({
          number: p.number,
          url: p.html_url,
          state: p.state,
          merged: !!p.pull_request?.merged_at,
        })),
      });
    }
    return out;
  }

  /**
   * 12.11.2026 (AI assistant like the foreman): the open PRs into main whose
   * head branch starts with [prefix] and lives in THIS repository (a fork
   * may name a branch ai/… too). Read-only token. At most 50, newest first.
   */
  async openPullsByPrefix(
    prefix: string,
  ): Promise<{ repo: string; pulls: GithubPull[] }> {
    const c = await this.creds();
    if (!c) throw new Error('GitHub App is not configured');
    const token = await this.installationToken(c, { pull_requests: 'read' });
    const res = await fetch(
      `${GH_API}/repos/${c.repo}/pulls?state=open&base=main&sort=created&direction=desc&per_page=50`,
      { headers: this.headers(token), signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) {
      throw new Error(`GitHub pull list failed (HTTP ${res.status})`);
    }
    const repo = c.repo.toLowerCase();
    return {
      repo: c.repo,
      pulls: ((await res.json()) as RawPull[])
        .map(toPull)
        .filter(
          (p) =>
            p.headRef.startsWith(prefix) && p.headRepo.toLowerCase() === repo,
        ),
    };
  }

  /** One PR, read fresh (the approve step trusts nothing older). */
  async pull(n: number): Promise<{ repo: string; pull: GithubPull | null }> {
    const c = await this.creds();
    if (!c) throw new Error('GitHub App is not configured');
    const token = await this.installationToken(c, { pull_requests: 'read' });
    const res = await fetch(`${GH_API}/repos/${c.repo}/pulls/${n}`, {
      headers: this.headers(token),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return { repo: c.repo, pull: null };
    if (!res.ok) {
      throw new Error(`GitHub pull read failed (HTTP ${res.status})`);
    }
    return { repo: c.repo, pull: toPull((await res.json()) as RawPull) };
  }

  /**
   * The PR's changed files with their diffs. GitHub lists at most 3000;
   * `complete` is false when the list may be cut, so the guard refuses.
   */
  async pullFiles(n: number): Promise<{
    files: GithubPullFile[];
    complete: boolean;
  }> {
    const c = await this.creds();
    if (!c) throw new Error('GitHub App is not configured');
    const token = await this.installationToken(c, { pull_requests: 'read' });
    const files: GithubPullFile[] = [];
    const per = 100;
    for (let page = 1; page <= 30; page++) {
      const res = await fetch(
        `${GH_API}/repos/${c.repo}/pulls/${n}/files?per_page=${per}&page=${page}`,
        { headers: this.headers(token), signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) {
        throw new Error(`GitHub pull files failed (HTTP ${res.status})`);
      }
      const rows = (await res.json()) as {
        filename: string;
        previous_filename?: string;
        patch?: string;
      }[];
      for (const f of rows) {
        files.push({
          filename: f.filename,
          previousFilename: f.previous_filename ?? null,
          patch: f.patch ?? null,
        });
      }
      if (rows.length < per) return { files, complete: true };
    }
    return { files, complete: false };
  }

  /**
   * CI of one commit: its check runs (latest per name) and commit statuses
   * (latest per context). The App needs Checks + Commit statuses: read.
   */
  async commitChecks(sha: string): Promise<{
    runs: { name: string; status: string; conclusion: string | null }[];
    statuses: { context: string; state: string }[];
  }> {
    const c = await this.creds();
    if (!c) throw new Error('GitHub App is not configured');
    const token = await this.installationToken(c, {
      checks: 'read',
      statuses: 'read',
    });
    const runs: { name: string; status: string; conclusion: string | null }[] =
      [];
    for (let page = 1; page <= 5; page++) {
      const res = await fetch(
        `${GH_API}/repos/${c.repo}/commits/${sha}/check-runs?filter=latest&per_page=100&page=${page}`,
        { headers: this.headers(token), signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) {
        throw new Error(`GitHub check runs failed (HTTP ${res.status})`);
      }
      const body = (await res.json()) as {
        total_count?: number;
        check_runs?: {
          name: string;
          status: string;
          conclusion: string | null;
        }[];
      };
      const rows = body.check_runs ?? [];
      for (const r of rows) {
        runs.push({
          name: r.name,
          status: r.status,
          conclusion: r.conclusion,
        });
      }
      if (rows.length < 100 || runs.length >= (body.total_count ?? 0)) break;
    }
    const s = await fetch(`${GH_API}/repos/${c.repo}/commits/${sha}/status`, {
      headers: this.headers(token),
      signal: AbortSignal.timeout(10_000),
    });
    if (!s.ok) {
      throw new Error(`GitHub commit status failed (HTTP ${s.status})`);
    }
    const st = (await s.json()) as {
      statuses?: { context: string; state: string }[];
    };
    return {
      runs,
      statuses: (st.statuses ?? []).map((x) => ({
        context: x.context,
        state: x.state,
      })),
    };
  }

  /**
   * Squash-merges PR [n] only while its head is still [sha] (GitHub answers
   * 409 otherwise). Token narrowed to contents + pull requests: write.
   * Returns the merge commit; throws GithubMergeError with GitHub's words.
   */
  async mergePull(
    n: number,
    sha: string,
    title: string,
  ): Promise<{ sha: string }> {
    const c = await this.creds();
    if (!c) throw new Error('GitHub App is not configured');
    const token = await this.installationToken(c, {
      contents: 'write',
      pull_requests: 'write',
    });
    const res = await fetch(`${GH_API}/repos/${c.repo}/pulls/${n}/merge`, {
      method: 'PUT',
      headers: this.headers(token),
      body: JSON.stringify({
        merge_method: 'squash',
        sha,
        commit_title: `${title.slice(0, 200)} (#${n})`,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      merged?: boolean;
      sha?: string;
      message?: string;
    };
    if (res.status !== 200 || !body.merged || !body.sha) {
      throw new GithubMergeError(
        res.status,
        (body.message ?? `HTTP ${res.status}`).slice(0, 200),
      );
    }
    this.log.log(`PR #${n} squash-merged at ${sha.slice(0, 12)}`);
    return { sha: body.sha };
  }

  /** Closes PR [n], leaving [comment] first (pull requests + issues: write). */
  async closePull(n: number, comment: string): Promise<void> {
    const c = await this.creds();
    if (!c) throw new Error('GitHub App is not configured');
    const token = await this.installationToken(c, {
      issues: 'write',
      pull_requests: 'write',
    });
    const cm = await fetch(`${GH_API}/repos/${c.repo}/issues/${n}/comments`, {
      method: 'POST',
      headers: this.headers(token),
      body: JSON.stringify({ body: comment }),
      signal: AbortSignal.timeout(10_000),
    });
    if (cm.status !== 201) {
      throw new Error(`GitHub did not add the comment (HTTP ${cm.status})`);
    }
    const res = await fetch(`${GH_API}/repos/${c.repo}/pulls/${n}`, {
      method: 'PATCH',
      headers: this.headers(token),
      body: JSON.stringify({ state: 'closed' }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`GitHub did not close the PR (HTTP ${res.status})`);
    }
  }

  /**
   * Owner 2026-11-12 (row 49): deletes branch [ref] of the App's repo after
   * its PR was merged or rejected (the repo does not auto-delete head
   * branches: delete_branch_on_merge is false). Only `ai/…` branches, never
   * anything else; a branch already gone (404 / 422) is fine.
   */
  async deleteBranch(ref: string): Promise<boolean> {
    if (!/^ai\/[\w.-]+$/.test(ref)) {
      throw new Error('Only ai/… branches are deleted here');
    }
    const c = await this.creds();
    if (!c) throw new Error('GitHub App is not configured');
    const token = await this.installationToken(c, { contents: 'write' });
    const res = await fetch(
      `${GH_API}/repos/${c.repo}/git/refs/heads/${ref
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`,
      {
        method: 'DELETE',
        headers: this.headers(token),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (res.status === 204) return true;
    if (res.status === 404 || res.status === 422) return false;
    throw new Error(`GitHub did not delete the branch (HTTP ${res.status})`);
  }
}

/** A pull request, as the AI assistant page and its approve step need it. */
export interface GithubPull {
  number: number;
  title: string;
  body: string;
  url: string;
  state: string;
  merged: boolean;
  draft: boolean;
  headRef: string;
  headRepo: string;
  headSha: string;
  baseRef: string;
  createdAt: string;
}

/** One changed file of a PR (patch missing for binary / too large). */
export interface GithubPullFile {
  filename: string;
  previousFilename: string | null;
  patch: string | null;
}

interface RawPull {
  number: number;
  title: string;
  body?: string | null;
  html_url: string;
  state: string;
  merged?: boolean;
  merged_at?: string | null;
  draft?: boolean;
  created_at: string;
  head: { ref: string; sha: string; repo?: { full_name?: string } | null };
  base: { ref: string };
}

function toPull(r: RawPull): GithubPull {
  return {
    number: r.number,
    title: r.title,
    body: r.body ?? '',
    url: r.html_url,
    state: r.state,
    merged: !!r.merged || !!r.merged_at,
    draft: !!r.draft,
    headRef: r.head.ref,
    headRepo: r.head.repo?.full_name ?? '',
    headSha: r.head.sha,
    baseRef: r.base.ref,
    createdAt: r.created_at,
  };
}

/** GitHub refused a merge (405 not mergeable, 409 head moved, …). */
export class GithubMergeError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Pure check of the OIDC claims (exported for tests). */
export function callerFromClaims(
  p: JWTPayload,
  repo: string,
  workflowFile: string = INFRA_WORKFLOW_FILE,
): WorkflowCaller {
  const str = (v: unknown): string =>
    typeof v === 'string' || typeof v === 'number' ? String(v) : '';
  const r = repo.toLowerCase();
  const repository = str(p.repository).toLowerCase();
  const wf = str(p.job_workflow_ref ?? p.workflow_ref).toLowerCase();
  if (repository !== r) throw new InfraAuthError('wrong repository');
  if (p.ref !== 'refs/heads/main') throw new InfraAuthError('not main');
  if (wf !== `${r}/.github/workflows/${workflowFile}@refs/heads/main`) {
    throw new InfraAuthError('wrong workflow');
  }
  const runId = str(p.run_id);
  if (!/^\d+$/.test(runId)) throw new InfraAuthError('no run id');
  return {
    runId,
    runUrl: `https://github.com/${repo}/actions/runs/${runId}`,
  };
}
