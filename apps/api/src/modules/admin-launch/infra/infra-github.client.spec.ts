import { generateKeyPairSync } from 'node:crypto';
import { GithubMergeError, InfraGithubClient } from './infra-github.client';

/**
 * 12.11.2026: the AI assistant's PR calls. GitHub is a fetch fake; the App
 * key is a throwaway RSA key made here. Checks the narrowed token rights,
 * the sha-pinned squash merge and the fork filter.
 */
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

type Call = { url: string; method: string; body: unknown };

function client(answers: (c: Call) => { status: number; body: unknown }) {
  const calls: Call[] = [];
  const fake = jest.fn((url: string, init?: RequestInit) => {
    const c: Call = {
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(c);
    const a = url.endsWith('/access_tokens')
      ? { status: 201, body: { token: 'inst-token' } }
      : answers(c);
    return Promise.resolve(
      new Response(JSON.stringify(a.body), { status: a.status }),
    );
  });
  global.fetch = fake as unknown as typeof fetch;
  const secrets = {
    get: jest.fn(() =>
      Promise.resolve({
        fields: {
          repo: 'o/r',
          appId: '1',
          installationId: '2',
          privateKey: PEM,
        },
      }),
    ),
  };
  return { c: new InfraGithubClient(secrets as never), calls };
}

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

const raw = (over: Record<string, unknown> = {}) => ({
  number: 9,
  title: 't',
  body: 'b',
  html_url: 'https://github.com/o/r/pull/9',
  state: 'open',
  draft: false,
  created_at: '2026-11-12T00:00:00Z',
  head: { ref: 'ai/issue-7', sha: 'a'.repeat(40), repo: { full_name: 'o/r' } },
  base: { ref: 'main' },
  ...over,
});

describe('InfraGithubClient: AI assistant PRs (12.11.2026)', () => {
  it('merges squash pinned to the sha with a contents + pull requests write token only', async () => {
    const { c, calls } = client(() => ({
      status: 200,
      body: { merged: true, sha: 'b'.repeat(40) },
    }));
    const r = await c.mergePull(9, 'a'.repeat(40), 'fix: x');
    expect(r.sha).toBe('b'.repeat(40));
    const token = calls.find((x) => x.url.endsWith('/access_tokens'));
    expect(token?.body).toEqual({
      repositories: ['r'],
      permissions: { contents: 'write', pull_requests: 'write' },
    });
    const merge = calls.find((x) => x.url.endsWith('/pulls/9/merge'));
    expect(merge?.method).toBe('PUT');
    expect(merge?.body).toMatchObject({
      merge_method: 'squash',
      sha: 'a'.repeat(40),
    });
  });

  it('a refused merge (head moved) comes back as GithubMergeError 409', async () => {
    const { c } = client(() => ({
      status: 409,
      body: { message: 'Head branch was modified.' },
    }));
    const e = (await c
      .mergePull(9, 'a'.repeat(40), 't')
      .catch((x: unknown) => x)) as GithubMergeError;
    expect(e).toBeInstanceOf(GithubMergeError);
    expect(e.status).toBe(409);
  });

  it('lists only ai/ branches of this repository, never a fork', async () => {
    const { c } = client(() => ({
      status: 200,
      body: [
        raw(),
        raw({
          number: 10,
          head: { ref: 'ai/x', sha: 'c', repo: { full_name: 'evil/r' } },
        }),
        raw({
          number: 11,
          head: { ref: 'feature/y', sha: 'd', repo: { full_name: 'o/r' } },
        }),
      ],
    }));
    const r = await c.openPullsByPrefix('ai/');
    expect(r.pulls.map((p) => p.number)).toEqual([9]);
    expect(r.pulls[0]).toMatchObject({
      headSha: 'a'.repeat(40),
      baseRef: 'main',
    });
  });

  it('a PR file list that may be cut is reported as incomplete', async () => {
    const page = Array.from({ length: 100 }, (_, i) => ({ filename: `f${i}` }));
    const { c } = client(() => ({ status: 200, body: page }));
    const r = await c.pullFiles(9);
    expect(r.complete).toBe(false);
    expect(r.files).toHaveLength(3000);
  });
});

describe('InfraGithubClient: deleting AI branches (owner 2026-11-12, row 49)', () => {
  function del(status: number) {
    const { c, calls } = client(() => ({ status: 200, body: {} }));
    const inner = global.fetch;
    global.fetch = jest.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        calls.push({ url, method: 'DELETE', body: undefined });
        return Promise.resolve(
          new Response(status === 204 ? null : '{}', { status }),
        );
      }
      return inner(url, init);
    }) as unknown as typeof fetch;
    return { c, calls };
  }

  it('deletes ai/ branches with a contents-write token only', async () => {
    const { c, calls } = del(204);
    await expect(c.deleteBranch('ai/issue-7')).resolves.toBe(true);
    const d = calls.find((x) => x.method === 'DELETE');
    expect(d?.url).toMatch(/\/repos\/o\/r\/git\/refs\/heads\/ai\/issue-7$/);
    const token = calls.find((x) => x.url.endsWith('/access_tokens'));
    expect(token?.body).toEqual({
      repositories: ['r'],
      permissions: { contents: 'write' },
    });
  });

  it('a branch already gone is fine', async () => {
    await expect(del(404).c.deleteBranch('ai/x')).resolves.toBe(false);
    await expect(del(422).c.deleteBranch('ai/x')).resolves.toBe(false);
  });

  it('never deletes anything that is not an ai/ branch', async () => {
    const { c, calls } = del(204);
    for (const ref of [
      'main',
      'claude/x',
      'ai/../main',
      'ai/',
      'feature/ai/x',
    ]) {
      await expect(c.deleteBranch(ref)).rejects.toThrow('Only ai/');
    }
    expect(calls).toHaveLength(0);
  });
});
