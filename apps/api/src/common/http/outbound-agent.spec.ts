import {
  fcmDispatcher,
  installOutboundAgents,
  isStaleSocketError,
  resetOutboundAgentsForTest,
} from './outbound-agent';

describe('outbound agents (S8-3)', () => {
  afterEach(() => resetOutboundAgentsForTest());

  it('installs the FCM h2 agent by default', () => {
    installOutboundAgents({});
    expect(fcmDispatcher()).toBeDefined();
  });

  it('OUTBOUND_AGENT=off installs nothing', () => {
    installOutboundAgents({ OUTBOUND_AGENT: 'off' });
    expect(fcmDispatcher()).toBeUndefined();
  });

  it('OUTBOUND_FCM_H2=off keeps FCM on the global agent', () => {
    installOutboundAgents({ OUTBOUND_FCM_H2: 'off' });
    expect(fcmDispatcher()).toBeUndefined();
  });

  it('recognises a stale kept-alive socket, also behind fetch cause', () => {
    const cause = Object.assign(new Error('closed'), {
      code: 'UND_ERR_SOCKET',
    });
    expect(isStaleSocketError(new TypeError('fetch failed', { cause }))).toBe(
      true,
    );
    expect(isStaleSocketError(new Error('boom'))).toBe(false);
    expect(isStaleSocketError(undefined)).toBe(false);
  });
});
