import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appStorePhasedBuilds,
  appStoreRatings,
  combine,
  judgeCrashes,
  judgeRatings,
  main,
  nextStep,
  pickReleases,
  playRatings,
  playTrackBuilds,
  thresholds,
} from './rollout-guard.mjs';

const rel = (version, crashFree, totalSessions, has = true, crashFreeUsers = undefined) => ({
  version,
  projects: [{ slug: 'lawbid-mobile', healthData: { hasHealthData: has, crashFreeSessions: crashFree, totalSessions, crashFreeUsers } }],
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
  assert.deepEqual(cur, { release: 'b', crashFree: 99.5, crashFreeUsers: null, sessions: 800 });
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

// --- Stage 2 SRE (Б7): store truth, users, variables, the hourly watch ----------------------

test('crash-free USERS falling more than the allowed drop halts even when sessions look fine', () => {
  const prev = { release: 'lawbid@1.0.0+10', crashFree: 99.8, crashFreeUsers: 99.6, sessions: 9000 };
  const cur = { release: 'lawbid@1.0.1+11', crashFree: 99.7, crashFreeUsers: 98.4, sessions: 2000 };
  assert.equal(judgeCrashes(cur, prev).decision, 'halt');
  assert.match(judgeCrashes(cur, prev).reason, /users/);
  assert.equal(judgeCrashes({ ...cur, crashFreeUsers: 99.5 }, prev).decision, 'ok');
});

test('the versions compared are the builds on the store rollout, not a newer tester build', () => {
  const releases = [rel('lawbid@1.0.2+12', 90, 600), rel('lawbid@1.0.1+11', 99.7, 2000), rel('lawbid@1.0.0+10', 99.8, 9000)];
  const { cur, prev } = pickReleases(releases, 'lawbid-mobile', { cur: 11, prev: 10 });
  assert.equal(cur.release, 'lawbid@1.0.1+11');
  assert.equal(prev.release, 'lawbid@1.0.0+10');
  // Without the store: the two newest, as before.
  assert.equal(pickReleases(releases, 'lawbid-mobile').cur.release, 'lawbid@1.0.2+12');
});

test('Play track: inProgress = the build on the rollout, completed = the one before; none = idle', () => {
  const t = { releases: [{ status: 'inProgress', userFraction: 0.05, versionCodes: ['11'] }, { status: 'completed', versionCodes: ['10'] }] };
  assert.deepEqual(playTrackBuilds(t), { cur: 11, prev: 10, fraction: 0.05 });
  assert.ok(playTrackBuilds({ releases: [{ status: 'completed', versionCodes: ['11'] }] }).idle);
  assert.ok(playTrackBuilds({ releases: [{ status: 'halted', versionCodes: ['11'] }] }).idle, 'a halted one is not halted again');
});

test('App Store: the build of the ACTIVE phased release and of the version before it', () => {
  const j = {
    data: [
      { id: 'v2', attributes: { createdDate: '2026-11-20T00:00:00Z' }, relationships: { build: { data: { id: 'b2' } }, appStoreVersionPhasedRelease: { data: { id: 'p2' } } } },
      { id: 'v1', attributes: { createdDate: '2026-11-01T00:00:00Z' }, relationships: { build: { data: { id: 'b1' } }, appStoreVersionPhasedRelease: { data: null } } },
    ],
    included: [
      { type: 'builds', id: 'b2', attributes: { version: '11' } },
      { type: 'builds', id: 'b1', attributes: { version: '10' } },
      { type: 'appStoreVersionPhasedReleases', id: 'p2', attributes: { phasedReleaseState: 'ACTIVE' } },
    ],
  };
  assert.deepEqual(appStorePhasedBuilds(j), { cur: '11', prev: '10', fraction: null });
  j.included[2].attributes.phasedReleaseState = 'PAUSED';
  assert.ok(appStorePhasedBuilds(j).idle);
});

test('repository variables ROLLOUT_MAX_DROP / ROLLOUT_MIN_SESSIONS set the thresholds', () => {
  const t = thresholds({ ROLLOUT_MAX_DROP: '1.5', ROLLOUT_MIN_SESSIONS: '50' });
  assert.equal(t.maxCrashDropPp, 1.5);
  assert.equal(t.minSessions, 50);
  assert.equal(thresholds({}).maxCrashDropPp, 0.5);
  assert.equal(thresholds({ ROLLOUT_MAX_DROP: 'abc' }).maxCrashDropPp, 0.5);
});

test('next step is offered while all is well (never taken by itself)', () => {
  assert.equal(nextStep(0.05), '50');
  assert.equal(nextStep(0.5), '100');
  assert.equal(nextStep(1), null);
  assert.equal(nextStep(null), null);
});

/** A fake Sentry: project + releases with health. */
function withSentry(releases, f) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    const body = u.includes('/projects/') ? { id: '42' } : u.includes('/releases/') ? releases : null;
    if (body === null) return new Response('nope', { status: 404 });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return f().finally(() => {
    globalThis.fetch = real;
  });
}

const sentryEnv = { PLATFORM: 'android', SENTRY_AUTH_TOKEN: 'test-sentry-token', SENTRY_ORG: 'org' };

test('script with a fake Sentry: the new version is worse -> halt', async () => {
  const out = await withSentry([rel('lawbid@1.0.1+11', 98.0, 3000), rel('lawbid@1.0.0+10', 99.8, 9000)], () => main(sentryEnv));
  assert.equal(out.decision, 'halt');
});

test('script with a fake Sentry: too few sessions -> nothing happens (wait)', async () => {
  const out = await withSentry(
    [rel('lawbid@1.0.1+11', 90, 40), rel('lawbid@1.0.0+10', 99.8, 9000)],
    () => main({ ...sentryEnv, ROLLOUT_MIN_SESSIONS: '100' }),
  );
  assert.equal(out.decision, 'wait');
});

test('script with a fake Sentry: as good as before -> ok', async () => {
  const out = await withSentry([rel('lawbid@1.0.1+11', 99.8, 3000), rel('lawbid@1.0.0+10', 99.8, 9000)], () => main(sentryEnv));
  assert.equal(out.decision, 'ok');
});
