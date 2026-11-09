import {
  configSchema,
  validateConfigValue,
} from '../../modules/admin-config/config-schema';
import { CLIENT_TUNING_DEFS } from './client-tuning';

describe('R-11 reel warm-up switch is one word key', () => {
  it('client.video_prefetch_mode is off | on | auto, default on (owner 2026-11-09: no limiter)', () => {
    const s = configSchema()['client.video_prefetch_mode'];
    expect(CLIENT_TUNING_DEFS['client.video_prefetch_mode'].default).toBe(
      'on',
    );
    expect(validateConfigValue(s, 'off')).toBeNull();
    expect(validateConfigValue(s, 'auto')).toBeNull();
    expect(validateConfigValue(s, 2)).not.toBeNull();
    expect(validateConfigValue(s, 'sometimes')).not.toBeNull();
  });
});
