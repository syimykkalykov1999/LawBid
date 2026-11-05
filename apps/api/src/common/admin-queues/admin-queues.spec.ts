import {
  reportsQueueCountSql,
  reportsQueueWhereSql,
  openTicketsWhere,
  unreadTicketsWhere,
  verificationQueueWhere,
} from './admin-queues';

/** R-403: one predicate per queue, shared by the list and the badge. */
describe('admin queue definitions', () => {
  it('verification: the default view is submitted + needs_more_info with a submission time; a tab narrows to one status', () => {
    expect(verificationQueueWhere({})).toEqual({
      status: { in: ['submitted', 'needs_more_info'] },
      submitted_at: { not: null },
    });
    expect(verificationQueueWhere({ status: 'in_review' }).status).toEqual({
      in: ['in_review'],
    });
    expect(verificationQueueWhere({ stateCode: 'NY' }, ['US'])).toEqual({
      AND: [{ attorney: { user: { country_code: { in: ['US'] } } } }],
      status: { in: ['submitted', 'needs_more_info'] },
      submitted_at: { not: null },
      attorney: {
        licenses: { some: { state_code: 'NY', license_status: 'pending' } },
      },
    });
  });

  it('reports: the open queue is the whole status, handled ones a 180-day window; the count is one per object', () => {
    const open = reportsQueueWhereSql({});
    expect(open.sql).toMatch(/^WHERE status = \?::report_status/);
    expect(open.sql).not.toMatch(/interval '180 days'/);
    expect(open.values).toEqual(['open']);
    const handled = reportsQueueWhereSql(
      { status: 'dismissed', targetType: 'post', priority: true },
      ['US', 'CA'],
    );
    expect(handled.sql).toMatch(/interval '180 days'/);
    expect(handled.sql).toMatch(/AND target_type = \?::report_target_type/);
    expect(handled.sql).toMatch(/AND priority_review/);
    expect(handled.sql).toMatch(/reporter_id IN \(SELECT id FROM users/);
    expect(handled.values).toEqual(['dismissed', 'post', ['US', 'CA']]);
    const count = reportsQueueCountSql(open);
    expect(count.sql).toMatch(
      /SELECT count\(\*\)::INT AS n\s+FROM \(SELECT 1 FROM reports WHERE status = \?::report_status[\s\S]*GROUP BY target_type, target_id\) AS g/,
    );
    expect(count.values).toEqual(['open']);
  });

  it('support: unread by staff and not closed, narrowed to the agent countries', () => {
    expect(unreadTicketsWhere()).toEqual({
      unread_by_admin: true,
      status: { not: 'closed' },
    });
    expect(unreadTicketsWhere(['KG'])).toEqual({
      country_code: { in: ['KG'] },
      unread_by_admin: true,
      status: { not: 'closed' },
    });
  });

  it('support badge: the default «Открытые» tab, narrowed to the agent countries', () => {
    expect(openTicketsWhere()).toEqual({ status: 'open' });
    expect(openTicketsWhere(['KG'])).toEqual({
      country_code: { in: ['KG'] },
      status: 'open',
    });
  });
});
