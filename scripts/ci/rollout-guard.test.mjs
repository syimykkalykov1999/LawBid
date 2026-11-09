import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appStoreRatings,
  combine,
  judgeCrashes,
  judgeRatings,
  pickReleases,
  playRatings,
} from './rollout-guard.mjs';

const rel = (version, crashFree, totalSessions, has = true) => ({
  version,
  projects: [{ slug: 'lawbid-mobile', healthData: { hasHealthData: has, crashFreeSessions: crashFree, totalSessions } }],
});

test('crash-free: ok, too few sessions, below the floor, a drop against the previous version', () => {
  const prev = { release: 'lawbid@1.0.0+1', crashFree: 99.8, sessions: 9000 };
  assert.equal(judgeCrashes({ release: 'n', crashFree: 99.7, sessions: 2000 }, prev).decision, 'ok');
  assert.equal(judgeCrashes({ release: 'n', crashFree: 90, sessions: 100 }, prev).decision, 'wait');
  assert.equal(judgeCrashes(null, prev).decision, 'wait');
  assert.equal(judgeCrashes({ release: 'n', crashFree: 98.9, sessions: 2000 }, null).decision, 'halt');
  assert.equal(judgeCrashes({ release: 'n', crashFree: 99.2, sessions: 2000 }, prev).decision, 'halt');
});

test('Sentry releases: the two newest with health data', () => {
  const { cur, prev } = pickReleases(
    [rel('c', 0, 0, false), rel('b', 99.5, 800), rel('a', 99.9, 5000)],
    'lawbid-mobile',
  );
  assert.deepEqual(cur, { release: 'b', crashFree: 99.5, sessions: 800 });
  assert.equal(prev.release, 'a');
});

test('ratings: a drop of more than half a star halts, too few reviews never does', () => {
  const many = (avg, label) => ({ label, avg, count: 50 });
  assert.equal(judgeRatings(many(3.9, 'new'), many(4.6, 'old')).decision, 'halt');
  assert.equal(judgeRatings(many(4.3, 'new'), many(4.6, 'old')).decision, 'ok');
  assert.equal(judgeRatings({ label: 'new', avg: 1, count: 3 }, many(4.6, 'old')).decision, 'ok');
});

test('Play reviews are grouped by version code, App Store ones by days', () => {
  const r = (code, stars) => ({ comments: [{ userComment: { appVersionCode: code, starRating: stars } }] });
  const p = playRatings([r(11, 5), r(12, 1), r(12, 3), r(11, 4)]);
  assert.deepEqual(p.cur, { label: 'code 12', avg: 2, count: 2 });
  assert.equal(p.prev.avg, 4.5);
  const now = Date.parse('2026-11-09T12:00:00Z');
  const a = (daysAgo, rating) => ({ attributes: { rating, createdDate: new Date(now - daysAgo * 86_400_000).toISOString() } });
  const s = appStoreRatings([a(1, 2), a(2, 2), a(5, 5), a(10, 4)], now);
  assert.equal(s.cur.avg, 2);
  assert.equal(s.prev.avg, 4.5);
});

test('the worst verdict wins', () => {
  assert.equal(combine([{ decision: 'ok', reason: 'a' }, { decision: 'wait', reason: 'b' }]).decision, 'wait');
  assert.equal(combine([{ decision: 'blind', reason: 'a' }, { decision: 'halt', reason: 'b' }]).decision, 'halt');
  assert.deepEqual(combine([{ decision: 'ok', reason: 'x' }]).reasons, ['ok: x']);
});
