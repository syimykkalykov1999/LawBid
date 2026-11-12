import { randomUUID } from 'node:crypto';
import {
  agreementStats,
  inAuditSample,
  pickFeedback,
  routeLane,
  type ReviewedRow,
} from './ai-worker.routing';

const POLICY = { confidenceMin: 90, auditPct: 0 };
const ID = '00000000-0000-4000-8000-000000000001';
const v = (
  decision: 'approve' | 'reject' | 'request_info' | 'unclear',
  confidence: number,
  injectionSuspected = false,
) => ({ decision, confidence, injectionSuspected });

describe('AI worker routing by confidence (trust-and-safety pattern)', () => {
  it('confident approve / reject without red flags → bulk', () => {
    expect(routeLane(v('approve', 95), [], POLICY, ID)).toBe('bulk');
    expect(routeLane(v('reject', 90), ['name_mismatch'], POLICY, ID)).toBe(
      'bulk',
    );
  });

  it('low confidence → priority (the owner first)', () => {
    expect(routeLane(v('approve', 89), [], POLICY, ID)).toBe('priority');
  });

  it('unclear / request_info always go to the owner', () => {
    expect(routeLane(v('unclear', 99), [], POLICY, ID)).toBe('priority');
    expect(routeLane(v('request_info', 99), [], POLICY, ID)).toBe('priority');
  });

  it('an approve against a platform red flag is a conflict → priority', () => {
    expect(
      routeLane(v('approve', 99), ['licence_CA_past_expiry'], POLICY, ID),
    ).toBe('priority');
  });

  it('a suspected injection is never bulk', () => {
    expect(routeLane(v('approve', 100, true), [], POLICY, ID)).toBe('priority');
  });

  it('the threshold is the role setting', () => {
    expect(
      routeLane(v('approve', 70), [], { confidenceMin: 70, auditPct: 0 }, ID),
    ).toBe('bulk');
  });
});

describe('AI worker random audit sampling', () => {
  it('0 % never, 100 % always', () => {
    expect(inAuditSample(ID, 0)).toBe(false);
    expect(inAuditSample(ID, 100)).toBe(true);
    expect(
      routeLane(v('approve', 99), [], { confidenceMin: 90, auditPct: 100 }, ID),
    ).toBe('audit');
  });

  it('deterministic: the same item always lands on the same side', () => {
    for (let i = 0; i < 20; i++) {
      const id = randomUUID();
      expect(inAuditSample(id, 10)).toBe(inAuditSample(id, 10));
    }
  });

  it('about the configured share of confident items is audited', () => {
    const n = 20_000;
    let hit = 0;
    for (let i = 0; i < n; i++) if (inAuditSample(randomUUID(), 10)) hit++;
    expect(hit / n).toBeGreaterThan(0.08);
    expect(hit / n).toBeLessThan(0.12);
  });

  it('only confident items are sampled; the rest are priority anyway', () => {
    expect(
      routeLane(v('approve', 10), [], { confidenceMin: 90, auditPct: 100 }, ID),
    ).toBe('priority');
  });
});

describe('AI worker learning from the owner', () => {
  const row = (status: string, n: number): ReviewedRow => ({
    decision: 'approve',
    confidence: n,
    status,
    ownerDecision: status === 'rejected' ? 'reject' : null,
    ownerNote: null,
    flags: [],
  });

  it('corrections come first, then agreements, capped', () => {
    const picked = pickFeedback(
      [
        row('approved', 1),
        row('rejected', 2),
        row('approved', 3),
        row('rejected', 4),
      ],
      3,
    );
    expect(picked.map((r) => r.confidence)).toEqual([2, 4, 1]);
  });

  it('agreement rate with the owner', () => {
    expect(agreementStats({ approved: 0, rejected: 0 })).toEqual({
      reviewed: 0,
      agreed: 0,
      ratePct: null,
    });
    expect(agreementStats({ approved: 9, rejected: 1 }).ratePct).toBe(90);
  });
});
