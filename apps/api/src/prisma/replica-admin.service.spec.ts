import {
  LAG_START_S,
  LAG_STOP_S,
  ReplicaAdminService,
  decideManaged,
  decideReplica,
  decideReplicaAuto,
} from './replica-admin.service';
import { replicaLive } from './replica-live';
import { resolveReplicaUrl } from './replica-url';

describe('decideReplica (admin «Копия базы для чтения»)', () => {
  it('off while there is no instance: reads stay on the primary', () => {
    const s = decideReplica({ exists: false }, false);
    expect(s.state).toBe('off');
    expect(s.serving).toBe(false);
  });

  it('creating / deleting / failed never serve reads', () => {
    for (const [status, state] of [
      ['creating', 'creating'],
      ['backing-up', 'creating'],
      ['deleting', 'deleting'],
      ['failed', 'error'],
      ['storage-full', 'error'],
    ] as const) {
      const s = decideReplica(
        { exists: true, status, host: 'h', lag: 0 },
        true,
      );
      expect(s.state).toBe(state);
      expect(s.serving).toBe(false);
    }
  });

  it('available without a lag metric yet is still «creating»', () => {
    const s = decideReplica(
      { exists: true, status: 'available', host: 'h', lag: null },
      false,
    );
    expect(s.state).toBe('creating');
    expect(s.serving).toBe(false);
  });

  it('starts serving only at a small lag, stops only at a large one (no flapping)', () => {
    const at = (lag: number, was: boolean) =>
      decideReplica({ exists: true, status: 'available', host: 'h', lag }, was);
    expect(at(LAG_START_S - 1, false).serving).toBe(true);
    expect(at(LAG_START_S + 5, false).serving).toBe(false); // not yet
    expect(at(LAG_START_S + 5, true).serving).toBe(true); // keeps serving
    expect(at(LAG_STOP_S + 1, true)).toMatchObject({
      state: 'lagging',
      serving: false,
    });
  });
});

describe('replica host reaches the Prisma read client', () => {
  afterEach(() => replicaLive.set(null));

  it('the live host swaps only the host of DATABASE_URL', () => {
    const env = {
      DATABASE_URL: 'postgresql://u:p@primary:5432/lawbid?sslmode=require',
    };
    expect(resolveReplicaUrl(env, null)).toBeUndefined();
    expect(resolveReplicaUrl(env, 'replica.example')).toBe(
      'postgresql://u:p@replica.example:5432/lawbid?sslmode=require',
    );
  });

  it('a full DATABASE_REPLICA_URL wins over the live host', () => {
    const env = {
      DATABASE_URL: 'postgresql://u:p@primary/db',
      DATABASE_REPLICA_URL: 'postgresql://u:p@fixed/db',
    };
    expect(resolveReplicaUrl(env, 'replica.example')).toBe(
      'postgresql://u:p@fixed/db',
    );
  });

  it('is unavailable without the Terraform switch', async () => {
    const svc = new ReplicaAdminService({ get: () => undefined } as never);
    expect(svc.available).toBe(false);
    expect((await svc.status()).state).toBe('unavailable');
    expect(replicaLive.get()).toBeNull();
  });
});

describe('copies made by the infra pipeline (owner 2026-11-12)', () => {
  const env = (vars: Record<string, string>) =>
    ({ get: (k: string) => vars[k] }) as never;

  it('DB_REPLICA_HOST without the button switch is «managed», not «Недоступно»', async () => {
    const read = { replicaLagMs: 1500, usingReplica: true };
    const svc = new ReplicaAdminService(
      env({
        DB_REPLICA_HOST: 'lawbid-prod-postgres-replica-1.x.rds.amazonaws.com',
      }),
      undefined,
      undefined,
      read as never,
    );
    expect(svc.available).toBe(false);
    const s = await svc.status();
    expect(s).toMatchObject({
      state: 'managed',
      copies: 1,
      serving: true,
      lagSeconds: 1.5,
    });
    expect(s.note).toContain('Копий для чтения: 1');
    expect(s.note).toContain('«Копии базы только для чтения»');
    expect(s.note).not.toContain('db_replica_toggle');
  });

  it('counts every copy and says when reads are on the primary', () => {
    const s = decideManaged({
      copies: 3,
      serving: false,
      lagSeconds: null,
      disabled: false,
    });
    expect(s.copies).toBe(3);
    expect(s.serving).toBe(false);
    expect(s.note).toContain('из основной базы');
  });

  it('DB_REPLICA_ENABLED=false is never «serving»', () => {
    const s = decideManaged({
      copies: 1,
      serving: true,
      lagSeconds: 0,
      disabled: true,
    });
    expect(s.serving).toBe(false);
    expect(s.note).toContain('DB_REPLICA_ENABLED=false');
  });

  it('no copies at all points to the cloud rows, not to Terraform', async () => {
    const s = await new ReplicaAdminService(env({})).status();
    expect(s.state).toBe('unavailable');
    expect(s.copies).toBe(0);
    expect(s.note).not.toContain('db_replica_toggle');
  });
});

describe('decideReplicaAuto', () => {
  const busy = Array.from({ length: 12 }, () => 80);
  const base = { mode: 'auto', exists: false, coolingDown: false, cpu: busy };

  it('creates the replica after 3 busy hours', () => {
    expect(decideReplicaAuto(base)).toBe('create');
  });

  it('tolerates one missing quarter-hour, not two', () => {
    expect(decideReplicaAuto({ ...base, cpu: busy.slice(1) })).toBe('create');
    expect(decideReplicaAuto({ ...base, cpu: busy.slice(2) })).toBe('none');
  });

  it('does nothing when one quarter-hour was calm', () => {
    const cpu = [...busy];
    cpu[5] = 40;
    expect(decideReplicaAuto({ ...base, cpu })).toBe('none');
  });

  it('does nothing when off, when it exists, or within the 24 h cooldown', () => {
    expect(decideReplicaAuto({ ...base, mode: 'off' })).toBe('none');
    expect(decideReplicaAuto({ ...base, exists: true })).toBe('none');
    expect(decideReplicaAuto({ ...base, coolingDown: true })).toBe('none');
  });

  it('autoCheck is inert without the Terraform switch', async () => {
    const svc = new ReplicaAdminService({ get: () => undefined } as never);
    await expect(svc.autoCheck()).resolves.toBe('none');
  });
});
