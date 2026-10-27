import { Injectable, Logger } from '@nestjs/common';
import { createPrivateKey } from 'node:crypto';
import { SignJWT, createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { SecretsService } from '../../../common/secrets/secrets.service';

/** The workflow file the API may start, and the only one it trusts. */
export const INFRA_WORKFLOW_FILE = 'infra-apply.yml';
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

  /** The 1-hour installation token, narrowed to actions:write on one repo. */
  private async installationToken(c: {
    repo: string;
    appId: string;
    installationId: string;
    privateKey: string;
  }): Promise<string> {
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
          permissions: { actions: 'write' },
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
   * Checks the workflow's OIDC token; returns the run it came from.
   * Throws InfraAuthError on anything else.
   */
  async verifyCaller(
    authorization: string | undefined,
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
          audience: INFRA_OIDC_AUDIENCE,
        })
      ).payload;
    } catch {
      throw new InfraAuthError('bad token');
    }
    return callerFromClaims(payload, c.repo);
  }
}

/** Pure check of the OIDC claims (exported for tests). */
export function callerFromClaims(p: JWTPayload, repo: string): WorkflowCaller {
  const str = (v: unknown): string =>
    typeof v === 'string' || typeof v === 'number' ? String(v) : '';
  const r = repo.toLowerCase();
  const repository = str(p.repository).toLowerCase();
  const wf = str(p.job_workflow_ref ?? p.workflow_ref).toLowerCase();
  if (repository !== r) throw new InfraAuthError('wrong repository');
  if (p.ref !== 'refs/heads/main') throw new InfraAuthError('not main');
  if (wf !== `${r}/.github/workflows/${INFRA_WORKFLOW_FILE}@refs/heads/main`) {
    throw new InfraAuthError('wrong workflow');
  }
  const runId = str(p.run_id);
  if (!/^\d+$/.test(runId)) throw new InfraAuthError('no run id');
  return {
    runId,
    runUrl: `https://github.com/${repo}/actions/runs/${runId}`,
  };
}
