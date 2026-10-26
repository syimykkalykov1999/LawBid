import { signRequest } from './sigv4';

const creds = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
};

describe('signRequest (SigV4)', () => {
  it('matches the AWS test-suite vector get-vanilla', () => {
    const h = signRequest({
      method: 'GET',
      url: 'https://example.amazonaws.com/',
      region: 'us-east-1',
      service: 'service',
      credentials: creds,
      date: new Date('2015-08-30T12:36:00Z'),
    });
    expect(h['x-amz-date']).toBe('20150830T123600Z');
    expect(h.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
  });

  it('matches the AWS test-suite vector get-vanilla-query-order (sorted query)', () => {
    const h = signRequest({
      method: 'GET',
      url: 'https://example.amazonaws.com/?Param2=value2&Param1=value1',
      region: 'us-east-1',
      service: 'service',
      credentials: creds,
      date: new Date('2015-08-30T12:36:00Z'),
    });
    expect(h.authorization).toContain(
      'Signature=b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500',
    );
  });

  it('signs the payload hash and session token for Serverless', () => {
    const h = signRequest({
      method: 'POST',
      url: 'https://x.us-east-1.aoss.amazonaws.com/lawbid-case-v1/_search',
      body: '{"size":1}',
      region: 'us-east-1',
      service: 'aoss',
      credentials: { ...creds, sessionToken: 'tok' },
      date: new Date('2026-10-25T00:00:00Z'),
      contentSha256Header: true,
    });
    expect(h['x-amz-content-sha256']).toMatch(/^[0-9a-f]{64}$/);
    expect(h['x-amz-security-token']).toBe('tok');
    expect(h.authorization).toContain(
      'SignedHeaders=host;x-amz-content-sha256;x-amz-date;x-amz-security-token',
    );
    expect(h.authorization).toContain('/us-east-1/aoss/aws4_request');
  });

  it('is deterministic and body-sensitive', () => {
    const base = {
      method: 'POST',
      url: 'https://h/_bulk',
      region: 'r',
      service: 'aoss',
      credentials: creds,
      date: new Date('2026-01-01T00:00:00Z'),
      contentSha256Header: true,
    };
    const a = signRequest({ ...base, body: 'a' }).authorization;
    expect(signRequest({ ...base, body: 'a' }).authorization).toBe(a);
    expect(signRequest({ ...base, body: 'b' }).authorization).not.toBe(a);
  });
});
