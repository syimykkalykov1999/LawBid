import assert from 'node:assert/strict';
import test from 'node:test';
import { applyRamp, defaultGate, gateDecision, hasBannedClaim, hasContactInfo, mainText, wordCount } from '../lib/gate.mjs';

const gate = { ...defaultGate, enabled: true };

test('words are counted in the body only, entities decoded', () => {
  const html = '<head><title>one two three</title></head><main><h1>Hello</h1><script>var x=1</script><p>a &amp; b, c-d it\'s</p></main><footer>x y z</footer>';
  assert.equal(mainText(html), "Hello a & b, c-d it's");
  assert.equal(wordCount(mainText(html)), 5);
});

test('banned advertising claims are caught, ordinary words are not', () => {
  for (const t of ['The best lawyer in town', '#1 attorney', 'number one in NY', 'We guarantee results', 'Top-rated counsel', 'guaranteed win', 'The best lawyer, with the best interests of your child in mind']) assert.ok(hasBannedClaim(t), t);
  for (const t of ['Bestow a gift', 'Family law for 12 years', 'Issue #12 handled', 'The topic of ratings', 'Always in the best interests of the child', 'best interest standard']) assert.ok(!hasBannedClaim(t), t);
});

test('gate off: only the generator rule decides', () => {
  assert.deepEqual(gateDecision({ kind: 'page', baseIndex: true, words: 5, gate: { ...gate, enabled: false } }), { index: true, reason: null });
  assert.deepEqual(gateDecision({ kind: 'combo', baseIndex: false, gate: { ...gate, enabled: false } }), { index: false, reason: 'low-demand-empty' });
});

test('gate on: thin pages, thin profiles, few attorneys and unverified claims are noindex', () => {
  assert.equal(gateDecision({ kind: 'page', baseIndex: true, words: 299, gate }).reason, 'thin-page');
  assert.equal(gateDecision({ kind: 'page', baseIndex: true, words: 300, gate }).index, true);
  assert.equal(gateDecision({ kind: 'hub', baseIndex: true, words: 10, gate }).index, true);
  assert.equal(gateDecision({ kind: 'combo', baseIndex: true, attorneyCount: 2, gate }).reason, 'few-attorneys');
  assert.equal(gateDecision({ kind: 'combo', baseIndex: true, attorneyCount: 3, gate }).index, true);
  assert.equal(gateDecision({ kind: 'profile', baseIndex: true, bio: 'x'.repeat(149), gate }).reason, 'thin-profile');
  assert.equal(gateDecision({ kind: 'profile', baseIndex: true, bio: null, gate }).reason, 'thin-profile');
  assert.equal(gateDecision({ kind: 'profile', baseIndex: true, bio: 'x'.repeat(150), claimsText: 'Best lawyer', gate }).reason, 'unverified-claim');
  assert.equal(gateDecision({ kind: 'profile', baseIndex: true, bio: 'x'.repeat(150), claimsText: 'Family law', gate }).index, true);
});

const cands = (n) => Array.from({ length: n }, (_, i) => ({ path: `/p/${String(i).padStart(3, '0')}/`, priority: i < 2 ? '0.9' : '0.5' }));

test('ramp: the first run adopts the live pages (baseline), nothing is dropped', () => {
  const r = applyRamp({ candidates: cands(500), prev: null, today: '2026-10-27', perDay: 200 });
  assert.equal(r.admitted.size, 500);
  assert.equal(r.deferred.length, 0);
});

test('ramp: with a fresh start at most perDay new pages a day, best priority first', () => {
  const r = applyRamp({ candidates: cands(500), prev: null, today: '2026-10-27', perDay: 200, baseline: 'none' });
  assert.equal(r.admitted.size, 200);
  assert.equal(r.deferred.length, 300);
  assert.ok(r.admitted.has('/p/000/') && r.admitted.has('/p/001/'));
  assert.ok([...r.admitted.values()].every((d) => d === '2026-10-27'));
});

test('ramp: kept pages stay, the day budget is shared by two runs, the next day admits more', () => {
  const day1 = applyRamp({ candidates: cands(500), prev: null, today: '2026-10-27', perDay: 200, baseline: 'none' });
  const prev = { ramp: {}, pages: Object.fromEntries([...day1.admitted].map(([p, d]) => [p, { admitted: d }])) };
  const again = applyRamp({ candidates: cands(500), prev, today: '2026-10-27', perDay: 200 });
  assert.equal(again.admitted.size, 200); // second run the same day adds nothing
  const day2 = applyRamp({ candidates: cands(500), prev, today: '2026-10-28', perDay: 200 });
  assert.equal(day2.admitted.size, 400);
  assert.equal(day2.admitted.get('/p/000/'), '2026-10-27');
  const dropped = applyRamp({ candidates: cands(10), prev, today: '2026-10-28', perDay: 200 });
  assert.equal(dropped.admitted.size, 10); // a page that is no longer a candidate leaves
});

test('posts, legal questions and city hubs are gated even with the quality-gate switch off', () => {
  const off = { ...defaultGate, enabled: false };
  assert.deepEqual(gateDecision({ kind: 'post', baseIndex: true, chars: 299, gate: off }), { index: false, reason: 'thin-post' });
  assert.deepEqual(gateDecision({ kind: 'post', baseIndex: true, chars: 300, claimsText: 'plain text', gate: off }), { index: true, reason: null });
  assert.deepEqual(gateDecision({ kind: 'post', baseIndex: true, chars: 900, claimsText: 'We guarantee a win', gate: off }), { index: false, reason: 'unverified-claim' });
  assert.deepEqual(gateDecision({ kind: 'qa', baseIndex: true, chars: 120, gate: off }), { index: false, reason: 'thin-answer' });
  assert.deepEqual(gateDecision({ kind: 'qa', baseIndex: true, chars: 400, claimsText: 'x', gate: { ...off, minQaChars: 100 } }), { index: true, reason: null });
  assert.deepEqual(gateDecision({ kind: 'city', baseIndex: true, attorneyCount: 2, gate: off }), { index: false, reason: 'few-attorneys' });
  assert.deepEqual(gateDecision({ kind: 'city', baseIndex: true, attorneyCount: 3, gate: off }), { index: true, reason: null });
});

test('contact data is recognised: e-mail, phone with separators, SSN; years and counts are not', () => {
  for (const t of ['write to a.b+c@firm.example', 'call (212) 555-0199', 'call 212.555.0199', 'ssn 123-45-6789']) assert.ok(hasContactInfo(t), t);
  for (const t of ['In 2026 we handled 120 cases', 'Section 3-4-5', 'room 212']) assert.ok(!hasContactInfo(t), t);
});
