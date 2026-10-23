// Runs the compiled RedisThrottlerStorageService against the local Redis (db 9):
// behaviour (count, block, stays blocked) and Redis commands per call.
// Usage (after nest build): node bench/throttle-check.mjs
import Redis from 'ioredis';
import { RedisThrottlerStorageService } from '../dist/src/throttler/redis-throttler-storage.service.js';

const redis = new Redis('redis://localhost:6379/9');
const log = { setContext() {}, warn: console.warn };
const s = new RedisThrottlerStorageService(redis, log);
const key = 'check-' + Date.now();
const out = [];
for (let i = 0; i < 5; i++) out.push(await s.increment(key, 60000, 3, 120000, 'default'));
console.log(out.map((r) => `${r.totalHits}:${r.isBlocked ? 'B' : '-'}:${r.timeToBlockExpire}`).join(' '));
const before = Number((await redis.info('commandstats')).match(/cmdstat_evalsha:calls=(\d+)/)?.[1] ?? 0);
await s.increment(key + 'x', 60000, 3, 120000, 'default');
const after = Number((await redis.info('commandstats')).match(/cmdstat_evalsha:calls=(\d+)/)?.[1] ?? 0);
console.log('evalsha calls for one check:', after - before, '(was 6 commands before the change)');
await redis.quit();
