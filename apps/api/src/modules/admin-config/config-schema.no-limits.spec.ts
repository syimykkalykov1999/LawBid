import { configSchema, validateConfigValue } from './config-schema';
import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';

/**
 * Owner 14.11 «remove ALL limits for me»: the «Авто» / scale / infra / ha /
 * growth / partition / events / search / economy numbers keep only their
 * technical floor (0, or 1 where 0 breaks the math) and no ceiling. CPU %
 * (economy.db_cpu_limit_percent) and the endpoint count stay physical.
 */
const FLOORS: Record<string, number> = {
  'infra.auto_on_minutes': 1,
  'infra.auto_off_hours': 1,
  'infra.auto_max_usd_month': 0,
  'infra.search_engine_on_people': 1,
  'ha.release_days': 1,
  'growth.shard_db_gb': 1,
  'growth.shard_rows': 1,
  'partition.auto_rows': 1,
  'events.max_per_day': 1,
  'events.auto_ceiling_per_day': 1,
  'events.retention_days': 1,
  'search.engine_timeout_ms': 1,
  'search.ranked_cache_ttl_sec': 1,
  'queues.push_rate_per_sec': 1,
  'economy.max_spend_percent': 1,
  'economy.aws_cap_usd': 0,
};

describe('owner «no limits»: «Авто» numbers have only a technical floor', () => {
  const schema = configSchema();
  it.each(Object.entries(FLOORS))(
    '%s: the floor %d is accepted, no ceiling',
    (k, floor) => {
      expect(schema[k]).toBeDefined();
      expect(validateConfigValue(schema[k], floor)).toBeNull();
      expect(validateConfigValue(schema[k], 10 ** 12)).toBeNull();
      if (floor > 0)
        expect(validateConfigValue(schema[k], floor - 1)).not.toBeNull();
    },
  );

  it('defaults are unchanged and still valid', () => {
    for (const k of Object.keys(FLOORS)) {
      expect(
        validateConfigValue(
          schema[k],
          (APP_SETTINGS as Record<string, unknown>)[k],
        ),
      ).toBeNull();
    }
  });
});
