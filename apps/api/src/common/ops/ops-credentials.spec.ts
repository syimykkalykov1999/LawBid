import { assumeOpsRole, opsCredentials, signV4 } from './ops-credentials';

describe('signV4', () => {
  it('matches the AWS documentation example (iam ListUsers, 2015-08-30)', () => {
    const h = signV4({
      method: 'GET',
      host: 'iam.amazonaws.com',
      path: '/',
      query: { Action: 'ListUsers', Version: '2010-05-08' },
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
      },
      body: '',
      region: 'us-east-1',
      service: 'iam',
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      amzDate: '20150830T123600Z',
    });
    expect(h.authorization).toContain(
      'Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7',
    );
  });
});

describe('assumeOpsRole', () => {
  const xml = (exp: string) =>
    `<AssumeRoleResponse><AssumeRoleResult><Credentials><AccessKeyId>ASIAOPS</AccessKeyId><SecretAccessKey>sec</SecretAccessKey><SessionToken>tok</SessionToken><Expiration>${exp}</Expiration></Credentials></AssumeRoleResult></AssumeRoleResponse>`;

  it('calls STS with the external id, caches, and refreshes near expiry', async () => {
    let t = new Date('2026-10-25T10:00:00Z');
    const calls: { url: string; body: string }[] = [];
    const fetchFn = ((url: string, init: { body: string }) => {
      calls.push({ url, body: init.body });
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(xml(new Date(t.getTime() + 900_000).toISOString())),
      });
    }) as unknown as typeof fetch;
    const p = assumeOpsRole({
      roleArn: 'arn:aws:iam::1:role/x-ops',
      externalId: 'e'.repeat(32),
      region: 'us-east-1',
      baseCredentials: () =>
        Promise.resolve({
          accessKeyId: 'AKIA',
          secretAccessKey: 's',
          sessionToken: 'st',
        }),
      fetchFn,
      now: () => t,
    });
    const a = await p();
    expect(a.accessKeyId).toBe('ASIAOPS');
    await p();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://sts.us-east-1.amazonaws.com/');
    expect(calls[0].body).toContain('ExternalId=' + 'e'.repeat(32));
    expect(calls[0].body).toContain('Action=AssumeRole');
    t = new Date(t.getTime() + 800_000);
    await p();
    expect(calls).toHaveLength(2);
  });

  it('fails closed on an STS error (no silent fallback to task creds)', async () => {
    const p = assumeOpsRole({
      roleArn: 'r',
      region: 'us-east-1',
      baseCredentials: () =>
        Promise.resolve({ accessKeyId: 'a', secretAccessKey: 'b' }),
      fetchFn: (() =>
        Promise.resolve({
          ok: false,
          status: 403,
          text: () => Promise.resolve(''),
        })) as unknown as typeof fetch,
    });
    await expect(p()).rejects.toThrow('AssumeRole failed (403)');
  });
});

describe('opsCredentials', () => {
  it('is undefined without OPS_ROLE_ARN (default chain, behaviour unchanged)', () => {
    expect(opsCredentials(() => undefined, 'us-east-1')).toBeUndefined();
  });
});
