import type Redis from 'ioredis';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { StaffSettingsService } from '../staff-core/staff-settings.service';

/** Test-only: a real StaffSettingsService over a stored-config object. */
export const settingsOf = (stored: Record<string, unknown> = {}) =>
  new StaffSettingsService({
    all: () => Promise.resolve(stored),
  } as unknown as AppSettingsService);

/** Every switch the rating package needs, on. */
export const RATING_ON = {
  'staff.rating_enabled': true,
  'staff.sampling_enabled': true,
  'staff.golden_enabled': true,
  'staff.suggestions_enabled': true,
  'staff.anomalies_enabled': true,
};

/** Test-only: the few Redis commands the staff counters use, in memory. */
export class FakeStaffRedis {
  readonly strings = new Map<string, string>();
  readonly hashes = new Map<string, Map<string, number>>();
  readonly sets = new Map<string, Set<string>>();
  readonly lists = new Map<string, string[]>();
  commands = 0;

  set(
    key: string,
    value: string,
    _ex?: 'EX',
    _ttl?: number,
    mode?: 'NX' | 'XX',
  ): Promise<'OK' | null> {
    this.commands += 1;
    const has = this.strings.has(key);
    if ((mode === 'NX' && has) || (mode === 'XX' && !has)) {
      return Promise.resolve(null);
    }
    this.strings.set(key, value);
    return Promise.resolve('OK');
  }

  get(key: string): Promise<string | null> {
    this.commands += 1;
    return Promise.resolve(this.strings.get(key) ?? null);
  }

  smembers(key: string): Promise<string[]> {
    this.commands += 1;
    return Promise.resolve([...(this.sets.get(key) ?? [])]);
  }

  lpop(key: string, count: number): Promise<string[] | null> {
    this.commands += 1;
    const list = this.lists.get(key) ?? [];
    if (list.length === 0) return Promise.resolve(null);
    return Promise.resolve(list.splice(0, count));
  }

  pipeline() {
    const ops: Array<() => unknown> = [];
    const chain = {
      hincrby: (k: string, f: string, n: number) => {
        ops.push(() => {
          const h = this.hashes.get(k) ?? new Map<string, number>();
          h.set(f, (h.get(f) ?? 0) + n);
          this.hashes.set(k, h);
          return h.get(f);
        });
        return chain;
      },
      hgetall: (k: string) => {
        ops.push(() =>
          Object.fromEntries(
            [...(this.hashes.get(k) ?? [])].map(([f, v]) => [f, String(v)]),
          ),
        );
        return chain;
      },
      expire: () => chain,
      sadd: (k: string, m: string) => {
        ops.push(() => {
          const s = this.sets.get(k) ?? new Set<string>();
          s.add(m);
          this.sets.set(k, s);
        });
        return chain;
      },
      rpush: (k: string, v: string) => {
        ops.push(() => {
          const l = this.lists.get(k) ?? [];
          l.push(v);
          this.lists.set(k, l);
        });
        return chain;
      },
      ltrim: (k: string, start: number) => {
        ops.push(() => {
          const l = this.lists.get(k) ?? [];
          if (start < 0 && l.length > -start) l.splice(0, l.length + start);
        });
        return chain;
      },
      exec: () => {
        this.commands += 1;
        return Promise.resolve(ops.map((op) => [null, op()] as const));
      },
    };
    return chain;
  }

  asRedis(): Redis {
    return this as unknown as Redis;
  }
}
