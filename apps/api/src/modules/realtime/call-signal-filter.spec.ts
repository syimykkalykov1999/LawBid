import { relayOnlySignal } from './call-signal-filter';

const c = (typ: string) => ({
  type: 'candidate',
  candidate: `candidate:1 1 udp 1 203.0.113.1 5000 typ ${typ} generation 0`,
  sdpMid: '0',
  sdpMLineIndex: 0,
});

describe('relayOnlySignal', () => {
  it.each(['host', 'srflx', 'prflx'])('drops a %s candidate', (typ) => {
    expect(relayOnlySignal(c(typ))).toBeNull();
  });

  it('passes a relay candidate', () => {
    expect(relayOnlySignal(c('relay'))).toEqual(c('relay'));
  });

  it('cuts only the direct candidates out of an SDP', () => {
    const sdp = [
      'v=0',
      'a=candidate:1 1 udp 1 10.0.0.1 5000 typ host',
      'a=candidate:2 1 udp 1 203.0.113.1 5000 typ srflx raddr 0.0.0.0 rport 0',
      'a=candidate:3 1 udp 1 141.101.90.1 5000 typ relay raddr 0.0.0.0 rport 0',
      'a=end-of-candidates',
      '',
    ].join('\r\n');
    const out = relayOnlySignal({ type: 'offer', sdp }) as { sdp: string };
    expect(out.sdp.split('\r\n')).toEqual([
      'v=0',
      'a=candidate:3 1 udp 1 141.101.90.1 5000 typ relay raddr 0.0.0.0 rport 0',
      'a=end-of-candidates',
      '',
    ]);
  });

  it('leaves every other signal alone', () => {
    const bye = { type: 'bye' };
    expect(relayOnlySignal(bye)).toBe(bye);
  });
});
