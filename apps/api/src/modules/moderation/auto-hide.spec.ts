import { ModerationService } from './moderation.service';
import { computeReportWeights, type WeightConfig } from './report-weight';

jest.mock('../../prisma/tx-retry.util', () => ({
  withTxRetry: (_p: unknown, fn: (tx: unknown) => unknown) => fn(txMock),
}));

const NOW = new Date();
const DAY = 24 * 3600 * 1000;
const CFG: WeightConfig = {
  newAccountDays: 7,
  newAccount: 0.2,
  unverifiedContact: 0.5,
  verifiedReporter: 1.5,
  accuracyMinReports: 3,
  clusterBySource: true,
  burstWindowHours: 24,
  burstMinAccounts: 3,
  burst: 0.2,
};

const post = {
  status: 'published',
  author_id: 'author',
  body: 'x',
  deleted_at: null,
  created_at: NOW,
  archived_at: null,
};
const txMock = {
  post: { findUnique: jest.fn(), update: jest.fn() },
};

interface Setup {
  settings: Record<string, unknown>;
  reporters: {
    id: string;
    ageDays: number;
    verifiedContact: boolean;
    sources: string[];
  }[];
  verifiedAuthor: boolean;
}

function build(s: Setup) {
  const report = {
    findMany: jest
      .fn()
      .mockResolvedValue(s.reporters.map((r) => ({ reporter_id: r.id }))),
    updateMany: jest.fn().mockResolvedValue({ count: 3 }),
  };
  const prisma = {
    report,
    attorneyProfile: {
      findUnique: jest.fn().mockResolvedValue({
        verification_status: s.verifiedAuthor ? 'verified' : 'unverified',
      }),
    },
    post: { findUnique: jest.fn().mockResolvedValue(post) },
    user: { findUnique: jest.fn().mockResolvedValue({ role: 'attorney' }) },
  };
  txMock.post.update.mockClear();
  txMock.post.findUnique.mockResolvedValue(post);
  txMock.post.update.mockResolvedValue({ archived_at: null });
  const settings = {
    string: jest.fn((k: string) => Promise.resolve(s.settings[k])),
    number: jest.fn((k: string) => Promise.resolve(s.settings[k])),
  };
  const reputation = {
    weigh: jest.fn((ids: string[]) =>
      Promise.resolve(
        computeReportWeights(
          s.reporters
            .filter((r) => ids.includes(r.id))
            .map((r) => ({
              id: r.id,
              createdAt: new Date(NOW.getTime() - r.ageDays * DAY),
              contactVerified: r.verifiedContact,
              verifiedAttorney: false,
              upheld: 0,
              rejected: 0,
              paused: false,
              sources: r.sources,
            })),
          [],
          NOW,
          CFG,
        ),
      ),
    ),
  };
  const auto = {
    evaluateAccount: jest.fn().mockResolvedValue(null),
    recordContentHide: jest.fn().mockResolvedValue(undefined),
  };
  const counters = { bump: jest.fn() };
  const svc = new ModerationService(
    prisma as never,
    counters as never,
    settings as never,
    {} as never,
    undefined,
    reputation as never,
    auto as never,
  );
  return { svc, report, auto, txMock };
}

const BASE = {
  'moderation.auto_hide_mode': 'weighted',
  'moderation.auto_hide_reports': 3,
  'moderation.auto_hide_score': 3,
  'moderation.verified_attorney_action': 'review',
  'moderation.verified_attorney_score': 6,
};

const old = (i: number) => ({
  id: `old${i}`,
  ageDays: 200 + i * 10, // spread out so they do not look like a sign-up burst
  verifiedContact: true,
  sources: [`ip:10.0.0.${i}`, `dev:d${i}`],
});
const sock = (i: number) => ({
  id: `sock${i}`,
  ageDays: 0.01,
  verifiedContact: false,
  sources: ['ip:6.6.6.6', 'dev:sockdevice'],
});

describe('autoHideIfThreshold (owner 2026-10-27)', () => {
  it("3 sock-puppet accounts cannot hide a verified attorney's post and it is flagged for priority review only when the score passes", async () => {
    const {
      svc,
      txMock: tx,
      auto,
    } = build({
      settings: BASE,
      reporters: [sock(1), sock(2), sock(3)],
      verifiedAuthor: true,
    });
    expect(await svc.autoHideIfThreshold('post', 'p1')).toBe(false);
    expect(tx.post.update).not.toHaveBeenCalled();
    expect(auto.recordContentHide).not.toHaveBeenCalled();
  });

  it('3 sock-puppet accounts cannot hide an ordinary post either', async () => {
    const { svc, txMock: tx } = build({
      settings: BASE,
      reporters: [sock(1), sock(2), sock(3)],
      verifiedAuthor: false,
    });
    expect(await svc.autoHideIfThreshold('post', 'p1')).toBe(false);
    expect(tx.post.update).not.toHaveBeenCalled();
  });

  it('mass reporting by many established, independent people hides an ordinary post and records an appealable decision', async () => {
    const {
      svc,
      txMock: tx,
      auto,
    } = build({
      settings: BASE,
      reporters: [old(1), old(2), old(3), old(4)],
      verifiedAuthor: false,
    });
    expect(await svc.autoHideIfThreshold('post', 'p1')).toBe(true);
    expect(tx.post.update).toHaveBeenCalled();
    expect(auto.recordContentHide).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'author',
        targetId: 'p1',
        threshold: 3,
      }),
    );
  });

  it('enough weight on a verified attorney goes to priority review, not to hidden', async () => {
    const {
      svc,
      txMock: tx,
      report,
    } = build({
      settings: BASE,
      reporters: [old(1), old(2), old(3), old(4)],
      verifiedAuthor: true,
    });
    expect(await svc.autoHideIfThreshold('post', 'p1')).toBe(false);
    expect(tx.post.update).not.toHaveBeenCalled();
    expect(report.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { priority_review: true } }),
    );
  });

  it('with the "hide" setting a verified attorney needs the higher score', async () => {
    const settings = { ...BASE, 'moderation.verified_attorney_action': 'hide' };
    const few = build({
      settings,
      reporters: [old(1), old(2), old(3), old(4)],
      verifiedAuthor: true,
    });
    expect(await few.svc.autoHideIfThreshold('post', 'p1')).toBe(false);
    const many = build({
      settings,
      reporters: [1, 2, 3, 4, 5, 6].map(old),
      verifiedAuthor: true,
    });
    expect(await many.svc.autoHideIfThreshold('post', 'p1')).toBe(true);
  });

  it('the old behaviour stays available: count mode hides at N distinct reporters', async () => {
    const { svc, txMock: tx } = build({
      settings: { ...BASE, 'moderation.auto_hide_mode': 'count' },
      reporters: [sock(1), sock(2), sock(3)],
      verifiedAuthor: false,
    });
    expect(await svc.autoHideIfThreshold('post', 'p1')).toBe(true);
    expect(tx.post.update).toHaveBeenCalled();
  });
});
