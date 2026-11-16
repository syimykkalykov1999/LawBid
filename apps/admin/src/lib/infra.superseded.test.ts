import { describe, expect, it } from 'vitest';
import { latestFor, showsFailure, type InfraRequest } from './infra';

/** Owner 15.11: a failure a later successful apply superseded no longer
 * marks the row «Не получилось»; the row shows the previous position. */
const req = (o: Partial<InfraRequest>): InfraRequest =>
  ({ id: 'x', itemId: 'aws.pgbouncer', status: 'done', settled: false, superseded: false, ...o }) as InfraRequest;

describe('superseded failures', () => {
  it('latestFor skips a superseded failure and finds the request before it', () => {
    const list = [req({ id: 'new', status: 'failed', superseded: true }), req({ id: 'old', status: 'done' })];
    expect(latestFor(list, 'aws.pgbouncer')?.id).toBe('old');
  });
  it('a failure not yet superseded still shows', () => {
    const list = [req({ id: 'new', status: 'failed', superseded: false })];
    expect(latestFor(list, 'aws.pgbouncer')?.id).toBe('new');
    expect(showsFailure(list[0])).toBe(true);
    expect(showsFailure(req({ status: 'failed', superseded: true }))).toBe(false);
  });
});
