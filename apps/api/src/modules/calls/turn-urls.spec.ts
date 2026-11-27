import {
  DEFAULT_STUN_URLS,
  GROUP_MAX_AUDIO,
  GROUP_MAX_VIDEO,
  withTcpFallback,
} from './calls.service';

describe('withTcpFallback', () => {
  it('adds a TCP twin after the UDP address', () => {
    expect(withTcpFallback(['turn:1.2.3.4:3478'])).toEqual([
      'turn:1.2.3.4:3478',
      'turn:1.2.3.4:3478?transport=tcp',
    ]);
  });

  it('leaves explicit transports and TLS alone', () => {
    const urls = ['turn:1.2.3.4:3478?transport=udp', 'turns:t.example:5349'];
    expect(withTcpFallback(urls)).toEqual(urls);
  });

  it('does not duplicate a TCP address that is already listed', () => {
    const urls = ['turn:1.2.3.4:3478', 'turn:1.2.3.4:3478?transport=tcp'];
    expect(withTcpFallback(urls)).toEqual(urls);
  });
});

describe('withTcpFallback, port 443 (26.11, calls.own_turn.port_443)', () => {
  it('UDP 3478, TCP 3478, then TCP 443 for each plain own address', () => {
    expect(
      withTcpFallback(['turn:1.2.3.4:3478', 'turn:turn.example.dev'], {
        port443: true,
      }),
    ).toEqual([
      'turn:1.2.3.4:3478',
      'turn:turn.example.dev',
      'turn:1.2.3.4:3478?transport=tcp',
      'turn:turn.example.dev?transport=tcp',
      'turn:1.2.3.4:443?transport=tcp',
      'turn:turn.example.dev:443?transport=tcp',
    ]);
  });

  it('also for addresses with the transports written out (Terraform turn_url)', () => {
    expect(
      withTcpFallback(
        [
          'turn:turn.example.dev:3478?transport=udp',
          'turn:turn.example.dev:3478?transport=tcp',
        ],
        { port443: true },
      ),
    ).toEqual([
      'turn:turn.example.dev:3478?transport=udp',
      'turn:turn.example.dev:3478?transport=tcp',
      'turn:turn.example.dev:443?transport=tcp',
    ]);
  });

  it('keeps IPv6 brackets', () => {
    expect(
      withTcpFallback(['turn:[2001:db8::1]:3478'], { port443: true }),
    ).toContain('turn:[2001:db8::1]:443?transport=tcp');
  });

  it('adds no turns: (the box has no certificate) and leaves listed ones as they are', () => {
    const urls = withTcpFallback(
      ['turn:1.2.3.4:3478', 'turns:t.example:443?transport=tcp'],
      { port443: true },
    );
    expect(urls.filter((u) => u.startsWith('turns:'))).toEqual([
      'turns:t.example:443?transport=tcp',
    ]);
  });

  it('off: only 3478, as before', () => {
    expect(withTcpFallback(['turn:1.2.3.4:3478'], { port443: false })).toEqual([
      'turn:1.2.3.4:3478',
      'turn:1.2.3.4:3478?transport=tcp',
    ]);
  });

  it('no duplicate when 443 is already listed', () => {
    const urls = ['turn:1.2.3.4:3478', 'turn:1.2.3.4:443?transport=tcp'];
    expect(withTcpFallback(urls, { port443: true })).toEqual([
      'turn:1.2.3.4:3478',
      'turn:1.2.3.4:443?transport=tcp',
      'turn:1.2.3.4:3478?transport=tcp',
    ]);
  });
});

describe('default STUN list (CF-7, audit 2026-10-26)', () => {
  it("has Cloudflare's STUN ahead of Google's", () => {
    expect(DEFAULT_STUN_URLS).toEqual([
      'stun:stun.cloudflare.com:3478',
      'stun:stun.l.google.com:19302',
    ]);
  });
});

describe('mesh call size (inbox 20d)', () => {
  it('holds nine people with or without video (more needs an SFU)', () => {
    expect(GROUP_MAX_AUDIO).toBe(9);
    expect(GROUP_MAX_VIDEO).toBe(9);
  });
});
