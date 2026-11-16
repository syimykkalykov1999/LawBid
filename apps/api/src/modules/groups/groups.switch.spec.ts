import { ForbiddenException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { FLAG_CATALOG, GROUPS_FLAG } from '../feature-flags/flag-catalog';
import { GroupsService } from './groups.service';

/**
 * Owner 2026-11-16 (row 183): the admin switch «Группы», like «Сообщества»
 * for channels. Off (the default) = every user request about groups is
 * refused with FEATURE_DISABLED before anything is read or written; the
 * groups' rows stay. On = the request goes on as before.
 */
const user = { sub: 'u1', role: 'client' } as never;

function service(enabled: boolean | null) {
  // prisma that fails the test if any query runs while the switch is off.
  const prisma = new Proxy(
    {},
    {
      get: () => {
        throw new Error('the database was touched');
      },
    },
  );
  const isEnabled = jest.fn((_key: string, fallback: boolean) =>
    Promise.resolve(enabled === null ? fallback : enabled),
  );
  const svc = new GroupsService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    undefined,
    undefined,
    undefined,
    { isEnabled } as never,
  );
  return { svc, isEnabled };
}

async function refused(p: Promise<unknown>): Promise<void> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(ForbiddenException);
  expect((e as ForbiddenException).getResponse()).toMatchObject({
    code: ErrorCode.FEATURE_DISABLED,
  });
}

describe('GroupsService — the switch «Группы» (row 183)', () => {
  it('the catalog has it, off by default and shipped to the app', () => {
    const def = FLAG_CATALOG.find((f) => f.key === GROUPS_FLAG);
    expect(def).toMatchObject({ enabled: false, app: true });
  });

  it('off: list, create, join, send, read, invites and calls are refused', async () => {
    const { svc, isEnabled } = service(false);
    await refused(svc.list(user));
    await refused(svc.create(user, { title: 'G', memberIds: [] }));
    await refused(svc.join(user, 'code'));
    await refused(svc.send(user, 'g1', { text: 'hi' } as never));
    await refused(svc.read(user, 'g1', 'm1'));
    await refused(svc.myInvites(user));
    await refused(svc.searchPublic(user, 'q'));
    await refused(svc.discover(user));
    await refused(svc.forwardSource(user, 'm1'));
    await refused(svc.sendForwarded(user, 'g1', 'k', {} as never, {}));
    // the calls module asks through assertMember
    await refused(svc.assertMember('u1', 'g1'));
    expect(isEnabled).toHaveBeenCalledWith(GROUPS_FLAG, true);
  });

  it('on: the request goes past the switch', async () => {
    const { svc } = service(true);
    await expect(svc.assertEnabled()).resolves.toBeUndefined();
    await expect(svc.enabled()).resolves.toBe(true);
    // past the switch it reaches the database (here: the throwing proxy)
    await expect(svc.myInvites(user)).rejects.toThrow(
      'the database was touched',
    );
  });

  it('a missing row reads as on (tests and a fresh database before boot), as channels', async () => {
    const { svc } = service(null);
    await expect(svc.enabled()).resolves.toBe(true);
  });
});
