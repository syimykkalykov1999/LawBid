import { GroupsService } from './groups.service';

/**
 * Audit 17.11 (problem 1): a group message deleted «for everyone» frees its
 * file, as the 1:1 revoke does (ChatActionsService.releaseFile). Before the
 * fix the file stayed in storage for good.
 */
function setup(fileId: string | null) {
  const row = {
    id: 'm1',
    group_id: 'g1',
    sender_id: 'u1',
    type: fileId ? 'file' : 'text',
    file_id: fileId,
    deleted_at: null,
  };
  const prisma = {
    chatGroupMessage: {
      findFirst: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockResolvedValue({ ...row, deleted_at: new Date() }),
    },
    chatGroupMessageReaction: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    chatGroup: { update: jest.fn() },
  };
  const releases = { releaseMessageFile: jest.fn().mockResolvedValue(true) };
  const none = {} as never;
  const svc = new GroupsService(
    prisma as never,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    releases as never,
  );
  jest.spyOn(svc, 'assertEnabled').mockResolvedValue(undefined);
  jest.spyOn(svc, 'requireMember').mockResolvedValue({
    can: () => false,
    group: { pinned_message_id: null },
  } as never);
  jest
    .spyOn(svc as unknown as { broadcast(): Promise<void> }, 'broadcast')
    .mockResolvedValue(undefined);
  jest
    .spyOn(svc as unknown as { groupChanged(): Promise<void> }, 'groupChanged')
    .mockResolvedValue(undefined);
  return { svc, releases };
}

const USER = { sub: 'u1' } as never;

describe('GroupsService.remove — the file of a deleted message', () => {
  it('releases the file of a message deleted for everyone', async () => {
    const { svc, releases } = setup('f1');
    await svc.remove(USER, 'g1', 'm1');
    expect(releases.releaseMessageFile).toHaveBeenCalledWith('f1', {
      groupMessageId: 'm1',
    });
  });

  it('a text message has no file to release', async () => {
    const { svc, releases } = setup(null);
    await svc.remove(USER, 'g1', 'm1');
    expect(releases.releaseMessageFile).not.toHaveBeenCalled();
  });

  it('a failed release does not undo the deletion', async () => {
    const { svc, releases } = setup('f1');
    releases.releaseMessageFile.mockRejectedValue(new Error('s3 down'));
    await expect(svc.remove(USER, 'g1', 'm1')).resolves.toBeUndefined();
  });
});
