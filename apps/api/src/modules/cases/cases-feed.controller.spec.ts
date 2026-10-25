import { CasesFeedController } from './cases-feed.controller';
import type { RequestUser } from '../auth/decorators/current-user.decorator';

const attorney: RequestUser = {
  sub: 'att-1',
  role: 'attorney',
  sid: 's1',
  verified: true,
  subscriptionStatus: 'active',
};

describe('CasesFeedController', () => {
  const etag = { caseDetail: jest.fn().mockResolvedValue(null) };
  const reqOf = (inm?: string) =>
    ({ headers: inm ? { 'if-none-match': inm } : {} }) as never;
  const resOf = () => ({ setHeader: jest.fn(), status: jest.fn() });

  function fakeFeed() {
    return {
      assertVisible: jest.fn().mockResolvedValue(undefined),
      listFeed: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
      getDetailForAttorney: jest.fn().mockResolvedValue({ id: 'c1' }),
      recordView: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
      unsave: jest.fn().mockResolvedValue(undefined),
    };
  }

  it('list() passes the JWT viewer through', async () => {
    const feed = fakeFeed();
    const controller = new CasesFeedController(feed as never, etag as never);
    await controller.listCaseFeed(attorney, {});
    expect(feed.listFeed).toHaveBeenCalledWith(
      { userId: 'att-1', role: 'attorney' },
      {},
    );
  });

  it('detail() forwards the attorney id and case id', async () => {
    const feed = fakeFeed();
    const controller = new CasesFeedController(feed as never, etag as never);
    await controller.getCaseDetail(
      attorney,
      { id: 'case-1' },
      reqOf(),
      resOf() as never,
    );
    expect(feed.getDetailForAttorney).toHaveBeenCalledWith('att-1', 'case-1');
  });

  it('detail(): a matching version tag is a 304 after the access check', async () => {
    const feed = fakeFeed();
    const controller = new CasesFeedController(feed as never, etag as never);
    etag.caseDetail.mockResolvedValueOnce('W/"case-attorney-1"');
    const res = resOf();
    const out = await controller.getCaseDetail(
      attorney,
      { id: 'case-1' },
      reqOf('W/"case-attorney-1"'),
      res as never,
    );
    expect(out).toBeUndefined();
    expect(feed.assertVisible).toHaveBeenCalledWith('att-1', 'case-1');
    expect(feed.getDetailForAttorney).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(304);
  });

  it('detail(): a different tag builds the body and sets the new tag', async () => {
    const feed = fakeFeed();
    const controller = new CasesFeedController(feed as never, etag as never);
    etag.caseDetail.mockResolvedValueOnce('W/"case-attorney-2"');
    const res = resOf();
    const out = await controller.getCaseDetail(
      attorney,
      { id: 'case-1' },
      reqOf('W/"case-attorney-1"'),
      res as never,
    );
    expect(out).toEqual({ id: 'c1' });
    expect(res.setHeader).toHaveBeenCalledWith('ETag', 'W/"case-attorney-2"');
  });

  it('view() records the view', async () => {
    const feed = fakeFeed();
    const controller = new CasesFeedController(feed as never, etag as never);
    await controller.recordCaseView(attorney, { id: 'case-1' });
    expect(feed.recordView).toHaveBeenCalledWith('att-1', 'case-1');
  });

  it('saveItem()/unsaveItem() pass the viewer + dto through', async () => {
    const feed = fakeFeed();
    const controller = new CasesFeedController(feed as never, etag as never);
    const dto = { itemType: 'case' as const, itemId: 'case-1' };
    await controller.saveItem(attorney, dto);
    expect(feed.save).toHaveBeenCalledWith(
      { userId: 'att-1', role: 'attorney' },
      dto,
    );
    await controller.unsaveItem(attorney, dto);
    expect(feed.unsave).toHaveBeenCalledWith(
      { userId: 'att-1', role: 'attorney' },
      dto,
    );
  });
});
