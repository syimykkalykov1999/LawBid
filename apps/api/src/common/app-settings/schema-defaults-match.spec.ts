import { configSchema } from '../../modules/admin-config/config-schema';
import { APP_SETTINGS } from './app-settings.defaults';

/**
 * Owner 2026-11-09: the admin showed «auto» for three money stops while the
 * server used «off» — the admin's schema had its own default. Every setting
 * the admin shows must show the value the server really uses.
 */
describe('admin schema defaults = the server defaults', () => {
  it('no setting shows a different default in the admin', () => {
    const schema = configSchema() as Record<string, { defaultValue?: unknown }>;
    const settings = APP_SETTINGS as Record<string, unknown>;
    const differ = Object.keys(settings)
      .filter((k) => schema[k] && 'defaultValue' in schema[k])
      .filter(
        (k) =>
          JSON.stringify(schema[k].defaultValue) !==
          JSON.stringify(settings[k]),
      )
      .map(
        (k) =>
          `${k}: admin ${JSON.stringify(schema[k].defaultValue)} / server ${JSON.stringify(settings[k])}`,
      );
    expect(differ).toEqual([]);
  });
});
