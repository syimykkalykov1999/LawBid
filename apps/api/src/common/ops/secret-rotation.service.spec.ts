import type { ConfigService } from '@nestjs/config';
import {
  SecretRotationService,
  rotationRow,
  type RotationFacts,
} from './secret-rotation.service';

const DAY = 86400;
const NOW = new Date('2026-11-20T00:00:00Z');
const nowSec = NOW.getTime() / 1000;

const facts = (over: Partial<RotationFacts> = {}): RotationFacts => ({
  lastRotatedEpoch: nowSec - 10 * DAY,
  createdEpoch: nowSec - 100 * DAY,
  rotationEnabled: true,
  overdue: false,
  failed: false,
  ...over,
});

describe('rotationRow', () => {
  it('recently rotated: ok, next due = last + period', () => {
    const r = rotationRow('JWT_KEYS', 90, facts(), NOW);
    expect(r.state).toBe('ok');
    expect(r.lastRotatedAt).toBe(
      new Date((nowSec - 10 * DAY) * 1000).toISOString(),
    );
    expect(r.nextDueAt).toBe(
      new Date((nowSec + 80 * DAY) * 1000).toISOString(),
    );
  });

  it('never rotated yet: counted from creation', () => {
    const r = rotationRow(
      'X',
      30,
      facts({ lastRotatedEpoch: 0, createdEpoch: nowSec - 5 * DAY }),
      NOW,
    );
    expect(r.state).toBe('never');
    expect(r.lastRotatedAt).toBeNull();
    expect(r.nextDueAt).toBe(
      new Date((nowSec + 25 * DAY) * 1000).toISOString(),
    );
  });

  it('more than 3 days late is overdue even if the Lambda has not said so', () => {
    const r = rotationRow(
      'X',
      30,
      facts({ lastRotatedEpoch: nowSec - 34 * DAY }),
      NOW,
    );
    expect(r.state).toBe('overdue');
  });

  it('failed beats overdue; off shows no next date; no report is unknown', () => {
    expect(
      rotationRow('X', 30, facts({ failed: true, overdue: true }), NOW).state,
    ).toBe('failed');
    const off = rotationRow('X', 30, facts({ rotationEnabled: false }), NOW);
    expect(off.state).toBe('off');
    expect(off.nextDueAt).toBeNull();
    expect(rotationRow('X', 30, null, NOW).state).toBe('unknown');
  });
});

describe('SecretRotationService', () => {
  const cfg = (v: Record<string, string>) =>
    ({ get: (k: string) => v[k] }) as unknown as ConfigService;

  it('is off without ROTATION_STATUS_SECRETS or with junk', async () => {
    expect(new SecretRotationService(cfg({})).enabled).toBe(false);
    expect(
      new SecretRotationService(cfg({ ROTATION_STATUS_SECRETS: '{bad' }))
        .enabled,
    ).toBe(false);
    expect(await new SecretRotationService(cfg({})).rows(NOW)).toEqual([]);
  });

  it('without a metric namespace every secret is unknown (not an error)', async () => {
    const s = new SecretRotationService(
      cfg({
        ROTATION_STATUS_SECRETS: JSON.stringify([
          { name: 'REDIS_URL', everyDays: 90 },
        ]),
      }),
    );
    expect(s.enabled).toBe(true);
    const rows = await s.rows(NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe('unknown');
  });
});
