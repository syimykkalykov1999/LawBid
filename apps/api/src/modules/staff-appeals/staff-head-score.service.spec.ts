import { StaffSettingsService } from '../staff-core/staff-settings.service';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { StaffHeadScoreService } from './staff-head-score.service';

/**
 * Verify batch 11 (D9): a complaint the owner rejected does not cost the
 * head. «nothing» (nothing to do) and «fire_worker» (the complaint was
 * baseless, its author left) were both decided against the complaint;
 * only «nothing» was left out, so a fire_worker case still took −50.
 */
describe('StaffHeadScoreService complaints (D9)', () => {
  const HEAD = '11111111-1111-4111-8111-111111111111';
  const appeals = [
    { author_id: 'a1', owner_decision: 'fire_worker' },
    { author_id: 'a2', owner_decision: 'nothing' },
  ];
  function build() {
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = {
      adminProfile: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ user_id: HEAD, workspace: 'mass' }])
          .mockResolvedValue([{ user_id: 'w1' }]),
      },
      staffRatingSnapshot: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      staffAction: { findMany: jest.fn().mockResolvedValue([]) },
      adminAppeal: {
        // Applies the decision filter the way PostgreSQL would.
        findMany: jest.fn(({ where }) => {
          const d = where.owner_decision as {
            not?: string;
            notIn?: string[];
          };
          return Promise.resolve(
            appeals.filter(
              (a) =>
                (d.not === undefined || a.owner_decision !== d.not) &&
                (d.notIn === undefined || !d.notIn.includes(a.owner_decision)),
            ),
          );
        }),
      },
      staffHeadSnapshot: { upsert },
    };
    const staff = new StaffSettingsService({
      all: () => Promise.resolve({}),
    } as unknown as AppSettingsService);
    return { svc: new StaffHeadScoreService(prisma as never, staff), upsert };
  }

  it('complaints the owner rejected leave the score at 100', async () => {
    const { svc, upsert } = build();
    await svc.run(new Date('2026-11-18T12:00:00Z'));
    expect(upsert.mock.calls[0][0].update.complaints_score).toBe(100);
  });
});
