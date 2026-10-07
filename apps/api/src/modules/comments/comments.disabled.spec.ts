import { ForbiddenException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { CommentsService } from './comments.service';

/** Owner 2026-10-07 (phone test): «Разрешить комментарии» off really
 * stops others from commenting — enforced by the server, replies too. */
describe('CommentsService.create with comments turned off', () => {
  const consume = jest.fn();
  const prisma = {
    post: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'p1',
        author_id: 'author',
        comments_enabled: false,
      }),
    },
  };
  const service = new CommentsService(
    prisma as never,
    { consume } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  it.each([undefined, 'parent-comment'])(
    'refuses with COMMENTS_DISABLED (parent %s)',
    async (parent) => {
      await expect(
        service.create('someone', 'p1', 'Hello', parent),
      ).rejects.toMatchObject({
        constructor: ForbiddenException,
        response: { code: ErrorCode.COMMENTS_DISABLED },
      });
      expect(consume).not.toHaveBeenCalled();
    },
  );
});
