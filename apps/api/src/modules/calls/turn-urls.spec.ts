import {
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

describe('mesh call size (inbox 20d)', () => {
  it('holds nine people with or without video (more needs an SFU)', () => {
    expect(GROUP_MAX_AUDIO).toBe(9);
    expect(GROUP_MAX_VIDEO).toBe(9);
  });
});
