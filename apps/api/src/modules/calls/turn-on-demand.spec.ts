/* eslint-disable @typescript-eslint/require-await */
import {
  RedisTurnStore,
  TURN_IDLE_MS,
  TurnOnDemand,
  type Ec2State,
  type TurnOnDemandPorts,
} from './turn-on-demand';

function setup(init: { state: Ec2State; ip?: string }) {
  const box = { state: init.state, ip: init.ip };
  const calls = { start: 0, stop: 0, check: 0 };
  const flags = { needed: false, answers: true, active: 0, now: 1_000_000 };
  const store = new RedisTurnStore();
  const ports: TurnOnDemandPorts = {
    instance: {
      describe: async () => ({ state: box.state, publicIp: box.ip }),
      start: async () => {
        calls.start++;
        box.state = 'pending';
      },
      stop: async () => {
        calls.stop++;
        box.state = 'stopping';
      },
    },
    store,
    needed: async () => flags.needed,
    activeCalls: async () => flags.active,
    relayAnswers: async () => {
      calls.check++;
      return flags.answers;
    },
    now: () => flags.now,
  };
  return { sut: new TurnOnDemand(ports), box, calls, flags, store };
}

describe('on-demand coturn state machine', () => {
  it('Cloudflare healthy, box stopped: nothing starts, no address', async () => {
    const t = setup({ state: 'stopped' });
    expect(await t.sut.tick()).toBe('idle');
    expect(t.calls.start).toBe(0);
    expect(await t.sut.address()).toBeNull();
  });

  it('breaker open + stopped: the box is started', async () => {
    const t = setup({ state: 'stopped' });
    t.flags.needed = true;
    expect(await t.sut.tick()).toBe('started');
    expect(t.calls.start).toBe(1);
    // booting: nothing offered yet, no second start
    expect(await t.sut.tick()).toBe('starting');
    expect(t.calls.start).toBe(1);
    expect(await t.sut.address()).toBeNull();
  });

  it('running but 3478 silent: not offered; answers: registered with the new ip', async () => {
    const t = setup({ state: 'running', ip: '3.4.5.6' });
    t.flags.needed = true;
    t.flags.answers = false;
    expect(await t.sut.tick()).toBe('waiting');
    expect(await t.sut.address()).toBeNull();
    t.flags.answers = true;
    expect(await t.sut.tick()).toBe('registered');
    expect(await t.sut.address()).toBe('turn:3.4.5.6:3478');
    expect(await t.sut.tick()).toBe('kept');
  });

  it('running without a public address yet: waits', async () => {
    const t = setup({ state: 'running' });
    t.flags.needed = true;
    expect(await t.sut.tick()).toBe('waiting');
  });

  it('a new address after a restart replaces the old one only when it answers', async () => {
    const t = setup({ state: 'running', ip: '1.1.1.1' });
    t.flags.needed = true;
    await t.sut.tick();
    t.box.ip = '2.2.2.2';
    t.flags.answers = false;
    expect(await t.sut.tick()).toBe('waiting');
    expect(await t.sut.address()).toBeNull();
    t.flags.answers = true;
    expect(await t.sut.tick()).toBe('registered');
    expect(await t.sut.address()).toBe('turn:2.2.2.2:3478');
  });

  it('Cloudflare back: the box stays up for 30 minutes, then stops when no call runs', async () => {
    const t = setup({ state: 'running', ip: '3.4.5.6' });
    t.flags.needed = true;
    await t.sut.tick(); // registered, lastNeeded = now
    t.flags.needed = false;
    t.flags.now += TURN_IDLE_MS - 1;
    expect(await t.sut.tick()).toBe('kept');
    expect(t.calls.stop).toBe(0);
    t.flags.now += 2;
    t.flags.active = 1;
    expect(await t.sut.tick()).toBe('kept'); // a call is on
    expect(t.calls.stop).toBe(0);
    t.flags.active = 0;
    expect(await t.sut.tick()).toBe('stopped');
    expect(t.calls.stop).toBe(1);
    expect(await t.sut.address()).toBeNull();
  });

  it('a breaker that reopens during the idle wait restarts the clock', async () => {
    const t = setup({ state: 'running', ip: '3.4.5.6' });
    t.flags.needed = true;
    await t.sut.tick();
    t.flags.needed = false;
    t.flags.now += TURN_IDLE_MS - 5_000;
    await t.sut.tick();
    t.flags.needed = true;
    t.flags.now += 10_000;
    await t.sut.tick(); // needed again -> stamp
    t.flags.needed = false;
    t.flags.now += TURN_IDLE_MS - 1;
    expect(await t.sut.tick()).toBe('kept');
  });

  it('needed while the box is still stopping: waits, starts after it stopped', async () => {
    const t = setup({ state: 'stopping' });
    t.flags.needed = true;
    expect(await t.sut.tick()).toBe('waiting');
    expect(t.calls.start).toBe(0);
    t.box.state = 'stopped';
    expect(await t.sut.tick()).toBe('started');
  });

  it('a terminated instance is reported, nothing is started', async () => {
    const t = setup({ state: 'terminated' });
    t.flags.needed = true;
    expect(await t.sut.tick()).toBe('unavailable');
    expect(t.calls.start).toBe(0);
  });

  it('a box someone started by hand that was never needed is stopped', async () => {
    const t = setup({ state: 'running', ip: '9.9.9.9' });
    t.flags.now = 10 * TURN_IDLE_MS;
    expect(await t.sut.tick()).toBe('stopped'); // never needed: lastNeeded = 0
  });
});
