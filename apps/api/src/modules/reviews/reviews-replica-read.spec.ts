import { ReviewsService } from './reviews.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaReadService } from '../../prisma/prisma-read.service';

/**
 * Replica seam (read-replica gate): the public rating summary is an
 * aggregate that may be a few seconds old, so it reads from the replica when
 * there is one and from the primary otherwise.
 */
describe('ReviewsService.summary replica read', () => {
  const groups = [
    { rating: 5, _count: { _all: 3 } },
    { rating: 4, _count: { _all: 1 } },
  ];
  const client = () => ({
    review: { groupBy: jest.fn().mockResolvedValue(groups) },
  });
  const build = (primary: object, read?: object) => {
    const svc = new ReviewsService(
      primary as unknown as PrismaService,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      read as unknown as PrismaReadService,
    );
    jest
      .spyOn(
        svc as unknown as { assertVisibleAttorney: () => Promise<void> },
        'assertVisibleAttorney',
      )
      .mockResolvedValue(undefined);
    return svc;
  };

  it('reads the summary from the replica within a 5 s staleness budget', async () => {
    const primary = client();
    const replica = client();
    const readDb = jest.fn().mockReturnValue(replica);
    const out = await build(primary, { readDb }).summary('a1');
    expect(readDb).toHaveBeenCalledWith({ maxStalenessMs: 5000 });
    expect(replica.review.groupBy).toHaveBeenCalledTimes(1);
    expect(primary.review.groupBy).not.toHaveBeenCalled();
    expect(out.ratingCount).toBe(4);
  });

  it('falls back to the primary when there is no replica seam', async () => {
    const primary = client();
    const out = await build(primary).summary('a1');
    expect(primary.review.groupBy).toHaveBeenCalledTimes(1);
    expect(out.ratingCount).toBe(4);
  });
});
