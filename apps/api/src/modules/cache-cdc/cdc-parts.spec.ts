import type Redis from 'ioredis';
import { CdcTxnBuffer, commitMs } from './cdc-txn-buffer';
import { CdcInvalidator } from './cdc-invalidator';
import { blockers, slotVerdict } from './cdc-slot';
import { cdcLight, type CdcStatus } from './cdc-status';
import { cdcTargets } from './cache-cdc.service';

const rel = (name: string, schema = 'public') => ({ schema, name });

describe('CdcTxnBuffer (one transaction → one batch at COMMIT)', () => {
  it('collects the actions of the rows and hands them over with the WAL end', () => {
    const b = new CdcTxnBuffer();
    expect(b.push({ tag: 'begin' })).toBeNull();
    expect(b.inTransaction).toBe(true);
    b.push({ tag: 'update', relation: rel('users'), new: { id: 'u1' } });
    b.push({ tag: 'update', relation: rel('users'), new: { id: 'u1' } });
    b.push({
      tag: 'delete',
      relation: rel('user_blocks'),
      key: { blocker_id: 'a', blocked_id: 'b' },
      old: null,
    });
    b.push({
      tag: 'insert',
      relation: rel('users', 'audit'),
      new: { id: 'x' },
    });
    const batch = b.push({
      tag: 'commit',
      commitEndLsn: '0/16B3748',
      commitTime: 1_700_000_000_123_456n,
    });
    expect(b.inTransaction).toBe(false);
    expect(batch).toMatchObject({
      endLsn: '0/16B3748',
      commitMs: 1_700_000_000_123,
      overflow: false,
    });
    expect(batch?.intents).toEqual([
      { kind: 'del', redis: 'main', key: 'lawbid:user-card:v1:u1' },
      { kind: 'del', redis: 'cache', key: 'blocks:a' },
      { kind: 'feed', uid: 'a' },
      { kind: 'del', redis: 'cache', key: 'blocks:b' },
      { kind: 'feed', uid: 'b' },
    ]);
  });

  it('caps a mass update: past the cap the rest end with the TTL (overflow)', () => {
    const b = new CdcTxnBuffer(3);
    b.push({ tag: 'begin' });
    for (let i = 0; i < 10; i++) {
      b.push({ tag: 'update', relation: rel('users'), new: { id: `u${i}` } });
    }
    const batch = b.push({ tag: 'commit', commitEndLsn: '0/1' });
    expect(batch?.intents).toHaveLength(3);
    expect(batch?.overflow).toBe(true);
  });

  it('commitMs reads pgoutput µs (bigint)', () => {
    expect(commitMs(2_000_000n)).toBe(2000);
    expect(commitMs(5000)).toBe(5);
  });
});

describe('CdcInvalidator', () => {
  const fake = () => {
    const calls: { cmd: string; args: unknown[] }[] = [];
    const r = new Proxy(
      {},
      {
        get: (_t, cmd: string) =>
          cmd === 'then'
            ? undefined
            : (...args: unknown[]) => {
                calls.push({ cmd, args });
                return Promise.resolve(cmd === 'get' ? '9' : 1);
              },
      },
    ) as unknown as Redis;
    return { r, calls };
  };

  it('splits a mass DEL into commands of at most 500 keys', async () => {
    const main = fake();
    const cache = fake();
    const intents = Array.from({ length: 1201 }, (_, i) => ({
      kind: 'del' as const,
      redis: 'cache' as const,
      key: `k${i}`,
    }));
    expect(await new CdcInvalidator(main.r, cache.r).apply(intents)).toBe(1201);
    const dels = cache.calls.filter((c) => c.cmd === 'del');
    expect(dels.map((d) => d.args.length)).toEqual([500, 500, 201]);
    expect(main.calls).toEqual([]);
  });

  it('plan terms use the current global version; a plan change bumps it', async () => {
    const main = fake();
    const cache = fake();
    await new CdcInvalidator(main.r, cache.r).apply([
      { kind: 'entitlements_user', uid: 'u' },
      { kind: 'entitlements_all' },
    ]);
    expect(cache.calls).toContainEqual({ cmd: 'del', args: ['ent:9:u'] });
    expect(main.calls).toContainEqual({ cmd: 'incr', args: ['ent:ver'] });
  });

  it('a refused DEL throws (the WAL position is then not acknowledged)', async () => {
    const bad = {
      del: () => Promise.reject(new Error('READONLY')),
    } as unknown as Redis;
    await expect(
      new CdcInvalidator(bad, bad).apply([
        { kind: 'del', redis: 'main', key: 'x' },
      ]),
    ).rejects.toThrow('READONLY');
  });
});

describe('slot guard (AWS: an unread logical slot fills the disk)', () => {
  const slot = (retainedMb: number, walStatus: string | null = 'reserved') => ({
    active: true,
    walStatus,
    retainedBytes: retainedMb * 1024 * 1024,
    behindBytes: 0,
  });
  it('keeps a healthy slot, drops one over the ceiling or lost', () => {
    expect(slotVerdict(null, 2048)).toBe('ok');
    expect(slotVerdict(slot(100), 2048)).toBe('ok');
    expect(slotVerdict(slot(2049), 2048)).toBe('drop');
    expect(slotVerdict(slot(1, 'lost'), 2048)).toBe('drop');
    expect(slotVerdict(slot(999_999), 0)).toBe('ok');
  });
  it('names what the owner has to turn on', () => {
    expect(
      blockers({
        walLevel: 'replica',
        publication: false,
        canReplicate: false,
      }),
    ).toEqual(['wal_level', 'no_publication', 'no_replication_right']);
    expect(
      blockers({ walLevel: 'logical', publication: true, canReplicate: true }),
    ).toEqual([]);
  });
});

describe('admin light', () => {
  const now = Date.parse('2026-11-25T12:00:00Z');
  const status = (
    over: Partial<CdcStatus['dbs'][number]>,
    mode = 'on',
  ): CdcStatus =>
    ({
      at: new Date(now - 10_000).toISOString(),
      mode,
      maxSlotWalMb: 2048,
      lagAlarmSec: 120,
      dbs: [
        {
          db: 'primary',
          state: 'streaming',
          blockers: [],
          slotRetainedMb: 1,
          slotBehindMb: 0,
          lagSec: 0,
          applied: 5,
          actions: 9,
          overflows: 0,
          slotDrops: 0,
          lastError: null,
          ...over,
        },
      ],
    }) as CdcStatus;
  it('grey when off or never written, green when streaming', () => {
    expect(cdcLight(null, now)).toBe('grey');
    expect(cdcLight(status({}, 'off'), now)).toBe('grey');
    expect(cdcLight(status({ state: 'waiting' }, 'auto'), now)).toBe('grey');
    expect(cdcLight(status({}), now)).toBe('green');
    expect(cdcLight(status({ state: 'standby' }), now)).toBe('green');
  });
  it('yellow on lag, error, missing owner step or a silent worker', () => {
    expect(cdcLight(status({ lagSec: 121 }), now)).toBe('yellow');
    expect(cdcLight(status({ state: 'error' }), now)).toBe('yellow');
    expect(cdcLight(status({ state: 'not_ready' }), now)).toBe('yellow');
    expect(cdcLight(status({}), now + 4 * 60_000)).toBe('yellow');
  });
  it('red when the slot keeps more than 80 % of the WAL ceiling', () => {
    expect(cdcLight(status({ slotRetainedMb: 1700 }), now)).toBe('red');
  });
});

describe('cdcTargets', () => {
  it('reads the direct URL first, then every extra database', () => {
    expect(
      cdcTargets({
        DATABASE_URL: 'postgresql://u:p@pool:5432/lawbid',
        CACHE_CDC_DATABASE_URL: 'postgresql://u:p@db:5432/lawbid',
        DATABASE_URL_SHARDS: '{"db1":"postgresql://u:p@db1:5432/lawbid"}',
      }),
    ).toEqual([
      { db: 'primary', url: 'postgresql://u:p@db:5432/lawbid' },
      { db: 'db1', url: 'postgresql://u:p@db1:5432/lawbid' },
    ]);
    expect(cdcTargets({})).toEqual([]);
  });
});
