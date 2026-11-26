import { socketClientIp } from './socket-ip';

describe('socketClientIp', () => {
  it('uses the peer address with no trusted proxy (header ignored)', () => {
    expect(socketClientIp({ 'x-forwarded-for': '9.9.9.9' }, '1.1.1.1', 0)).toBe(
      '1.1.1.1',
    );
  });
  it('takes the entry the trusted proxy appended, not what the client wrote', () => {
    expect(
      socketClientIp({ 'x-forwarded-for': '6.6.6.6, 2.2.2.2' }, '10.0.0.1', 1),
    ).toBe('2.2.2.2');
    expect(
      socketClientIp(
        { 'x-forwarded-for': '6.6.6.6, 2.2.2.2, 10.0.0.9' },
        '10.0.0.1',
        2,
      ),
    ).toBe('2.2.2.2');
  });
  it('G1: a handshake through the API edge (secret matches) trusts the CloudFront hop', () => {
    const secret = 'S'.repeat(40);
    const headers = {
      'x-forwarded-for': '6.6.6.6, 203.0.113.7, 130.176.1.1',
      'x-origin-verify': secret,
    };
    expect(socketClientIp(headers, '10.0.0.1', 1, secret)).toBe('203.0.113.7');
    // without the secret configured, or with a wrong one: the ALB entry only
    expect(socketClientIp(headers, '10.0.0.1', 1)).toBe('130.176.1.1');
    expect(socketClientIp(headers, '10.0.0.1', 1, 'T'.repeat(40))).toBe(
      '130.176.1.1',
    );
  });
  it('falls back to the peer when the header is missing', () => {
    expect(socketClientIp({}, '1.1.1.1', 1)).toBe('1.1.1.1');
  });
});
