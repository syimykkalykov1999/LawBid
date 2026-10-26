import {
  PUSH_ACTION_TTL_SEC,
  pushActionKey,
  signPushAction,
  verifyPushAction,
} from './push-action-token';
import { actorPushData } from './actor-push';

const key = pushActionKey('p'.repeat(40));

describe('push action ticket (notification buttons)', () => {
  it('round-trips who / which chat / group', () => {
    const t = signPushAction(key, { u: 'me', c: 'c1', g: 0 }, 1_000_000);
    expect(verifyPushAction(key, t, 1_000_000)).toMatchObject({
      u: 'me',
      c: 'c1',
      g: 0,
    });
  });

  it('expires after 48 h', () => {
    const t = signPushAction(key, { u: 'me', c: 'c1', g: 1 }, 0);
    expect(
      verifyPushAction(key, t, (PUSH_ACTION_TTL_SEC - 1) * 1000),
    ).not.toBeNull();
    expect(
      verifyPushAction(key, t, (PUSH_ACTION_TTL_SEC + 1) * 1000),
    ).toBeNull();
  });

  it('refuses a changed chat, another key and garbage', () => {
    const t = signPushAction(key, { u: 'me', c: 'c1', g: 0 });
    const [v, payload, mac] = t.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload, 'base64url').toString()),
        c: 'other',
      }),
    ).toString('base64url');
    expect(verifyPushAction(key, `${v}.${forged}.${mac}`)).toBeNull();
    expect(verifyPushAction(pushActionKey('q'.repeat(40)), t)).toBeNull();
    expect(verifyPushAction(key, 'v1.x.y')).toBeNull();
    expect(verifyPushAction(key, 'nonsense')).toBeNull();
  });
});

describe('actorPushData', () => {
  it('name + photo + its file id', () => {
    expect(
      actorPushData({
        name: 'Ann Lee',
        avatar: 'https://cdn/a',
        avatarKey: 'f1',
      }),
    ).toEqual({
      style: 'actor',
      actorName: 'Ann Lee',
      actorAvatar: 'https://cdn/a',
      actorAvatarKey: 'f1',
    });
  });

  it('a name without a photo (the app draws the letters)', () => {
    expect(
      actorPushData({ name: 'Ann', avatar: null, avatarKey: null }),
    ).toEqual({
      style: 'actor',
      actorName: 'Ann',
    });
  });

  it('nobody: nothing', () => {
    expect(actorPushData({ name: '', avatar: null, avatarKey: null })).toEqual(
      {},
    );
  });
});
