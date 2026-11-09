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
