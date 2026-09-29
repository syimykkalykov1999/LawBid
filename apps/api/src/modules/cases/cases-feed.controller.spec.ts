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
  function fakeFeed() {
    return {
      listFeed: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
      getDetailForAttorney: jest.fn().mockResolvedValue({ id: 'c1' }),
      recordView: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
      unsave: jest.fn().mockResolvedValue(undefined),
    };
  }

  it('list() passes the JWT viewer through', async () => {
    const feed = fakeFeed();
    const controller = new CasesFeedController(feed as never);
    await controller.listCaseFeed(attorney, {});
    expect(feed.listFeed).toHaveBeenCalledWith(
      { userId: 'att-1', role: 'attorney' },
      {},
    );
  });

  it('detail() forwards the attorney id and case id', async () => {
    const feed = fakeFeed();
    const controller = new CasesFeedController(feed as never);
    await controller.getCaseDetail(attorney, { id: 'case-1' });
    expect(feed.getDetailForAttorney).toHaveBeenCalledWith('att-1', 'case-1');
  });

  it('view() records the view', async () => {
    const feed = fakeFeed();
    const controller = new CasesFeedController(feed as never);
    await controller.recordCaseView(attorney, { id: 'case-1' });
    expect(feed.recordView).toHaveBeenCalledWith('att-1', 'case-1');
  });

  it('saveItem()/unsaveItem() pass the viewer + dto through', async () => {
    const feed = fakeFeed();
    const controller = new CasesFeedController(feed as never);
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
