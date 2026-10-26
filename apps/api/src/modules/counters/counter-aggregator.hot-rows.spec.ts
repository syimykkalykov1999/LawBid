import { COUNTERS } from './counter-aggregator.service';

/** Owner 2026-10-25 (DB audit finding 8): the hot rows moved to the
 * aggregator are declared with their own table, key and fields. */
describe('COUNTERS hot rows', () => {
  it('story views, promotion impressions/reach/clicks and channel posts', () => {
    expect(COUNTERS.story).toMatchObject({
      table: 'stories',
      key: 'id',
      fields: ['view_count'],
    });
    expect(COUNTERS.case_promotion).toMatchObject({
      table: 'case_promotions',
      key: 'id',
      fields: ['impressions', 'reach', 'clicks'],
      recount: false,
    });
    expect(COUNTERS.channel).toMatchObject({
      table: 'channels',
      key: 'id',
      fields: ['post_count'],
      recount: false,
    });
  });

  it('only entities with a source table are recounted nightly', () => {
    const noRecount = Object.entries(COUNTERS)
      .filter(([, d]) => (d as { recount?: boolean }).recount === false)
      .map(([e]) => e)
      .sort();
    expect(noRecount).toEqual(['case_promotion', 'channel']);
  });
});
