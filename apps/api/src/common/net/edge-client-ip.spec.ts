import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import request from 'supertest';
import {
  apiEdgeClientIp,
  forwardedClientIp,
  fromApiEdge,
  trustedHopsFor,
} from './edge-client-ip';

// Built at run time: the secret scan must not see a key-shaped literal.
const SECRET = Array.from({ length: 48 }, (_, i) =>
  String.fromCharCode(65 + ((i * 7) % 26)),
).join('');

describe('fromApiEdge', () => {
  it('only the exact edge secret counts', () => {
    expect(fromApiEdge({ 'x-origin-verify': SECRET }, SECRET)).toBe(true);
    expect(fromApiEdge({ 'x-origin-verify': `${SECRET}x` }, SECRET)).toBe(
      false,
    );
    expect(fromApiEdge({ 'x-origin-verify': SECRET.slice(1) }, SECRET)).toBe(
      false,
    );
    expect(fromApiEdge({}, SECRET)).toBe(false);
    expect(fromApiEdge({ 'x-origin-verify': [SECRET, SECRET] }, SECRET)).toBe(
      false,
    );
  });
  it('no secret configured (no edge) = never from the edge, even with an empty header', () => {
    expect(fromApiEdge({ 'x-origin-verify': '' }, '')).toBe(false);
    expect(fromApiEdge({ 'x-origin-verify': SECRET }, '')).toBe(false);
  });
});

describe('trustedHopsFor / forwardedClientIp', () => {
  // Through the edge: client-written entry, viewer (added by CloudFront),
  // CloudFront's own address (added by the ALB).
  const viaEdge = {
    'x-forwarded-for': '6.6.6.6, 203.0.113.7, 130.176.1.1',
    'x-origin-verify': SECRET,
  };
  it('a verified edge request trusts one hop more than the ALB', () => {
    expect(trustedHopsFor(viaEdge, 1, SECRET)).toBe(2);
    expect(forwardedClientIp(viaEdge, trustedHopsFor(viaEdge, 1, SECRET))).toBe(
      '203.0.113.7',
    );
  });
  it('without the secret a forged chain gets the ALB-appended entry only', () => {
    const direct = { 'x-forwarded-for': '6.6.6.6, 198.51.100.9' };
    expect(trustedHopsFor(direct, 1, SECRET)).toBe(1);
    expect(forwardedClientIp(direct, 1)).toBe('198.51.100.9');
    // a wrong secret is the same as none
    const forged = { ...direct, 'x-origin-verify': 'nope' };
    expect(forwardedClientIp(forged, trustedHopsFor(forged, 1, SECRET))).toBe(
      '198.51.100.9',
    );
  });
  it('no proxies trusted (local dev): the header is ignored', () => {
    expect(trustedHopsFor(viaEdge, 0, SECRET)).toBe(0);
    expect(forwardedClientIp(viaEdge, 0)).toBeUndefined();
  });
});

describe('apiEdgeClientIp middleware (real Express, trust proxy = 1)', () => {
  function app(secret: string) {
    const a = express();
    a.set('trust proxy', 1);
    a.use(apiEdgeClientIp(secret, 1));
    a.get('/ip', (req: Request, res: Response) => {
      res.json({ ip: req.ip });
    });
    return a;
  }

  it('step 1–3 of api-edge.md: an edge request gets the viewer, not CloudFront', async () => {
    const r = await request(app(SECRET))
      .get('/ip')
      .set('X-Forwarded-For', '6.6.6.6, 203.0.113.7, 130.176.1.1')
      .set('X-Origin-Verify', SECRET);
    expect(r.body.ip).toBe('203.0.113.7');
  });

  it('a direct request (DNS not moved or lock off) keeps the ALB-appended address', async () => {
    const r = await request(app(SECRET))
      .get('/ip')
      .set('X-Forwarded-For', '6.6.6.6, 198.51.100.9');
    expect(r.body.ip).toBe('198.51.100.9');
  });

  it('a guessed secret does not move the address', async () => {
    const r = await request(app(SECRET))
      .get('/ip')
      .set('X-Forwarded-For', '6.6.6.6, 198.51.100.9')
      .set('X-Origin-Verify', 'A'.repeat(48));
    expect(r.body.ip).toBe('198.51.100.9');
  });

  it('no edge configured: exactly Express trust proxy as before', async () => {
    const r = await request(app(''))
      .get('/ip')
      .set('X-Forwarded-For', '6.6.6.6, 203.0.113.7, 130.176.1.1')
      .set('X-Origin-Verify', SECRET);
    expect(r.body.ip).toBe('130.176.1.1');
  });

  it('a non-address entry is never used as the key', () => {
    const req = {
      headers: {
        'x-forwarded-for': 'not-an-ip, 130.176.1.1',
        'x-origin-verify': SECRET,
      },
    } as unknown as Request;
    const next: NextFunction = jest.fn();
    apiEdgeClientIp(SECRET, 1)(req, {} as Response, next);
    expect(Object.getOwnPropertyDescriptor(req, 'ip')).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
});
