import { AdminConfigService } from './admin-config.service';
import { configSchema, validateConfigValue } from './config-schema';

type Svc = { assertCloudflareSfuReady(k: string, v: unknown): Promise<void> };

function svc(
  fields: Record<string, string> | null,
  env: Record<string, string> = {},
) {
  const s = Object.create(AdminConfigService.prototype) as AdminConfigService;
  Object.assign(s, {
    secrets: { get: jest.fn().mockResolvedValue(fields ? { fields } : null) },
    config: { get: (k: string) => env[k] },
  });
  return s as unknown as Svc;
}

describe('calls.video_provider = cloudflare', () => {
  it('cannot be saved without the keys', async () => {
    await expect(
      svc(null).assertCloudflareSfuReady('calls.video_provider', 'cloudflare'),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      svc({ appId: 'x' }).assertCloudflareSfuReady(
        'calls.video_provider',
        'cloudflare',
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('can be saved with the keys (Integrations or env), other values need none', async () => {
    await svc({ appId: 'a', appToken: 'b' }).assertCloudflareSfuReady(
      'calls.video_provider',
      'cloudflare',
    );
    await svc(null, {
      CLOUDFLARE_SFU_APP_ID: 'a',
      CLOUDFLARE_SFU_APP_TOKEN: 'b',
    }).assertCloudflareSfuReady('calls.video_provider', 'cloudflare');
    await svc(null).assertCloudflareSfuReady('calls.video_provider', 'p2p');
    await svc(null).assertCloudflareSfuReady('calls.max_participants', 5);
  });
});

describe('SFU settings schema', () => {
  const schema = configSchema();
  it('video_provider accepts cloudflare; defaults are 20 and 4; no refuse mode exists', () => {
    expect(
      validateConfigValue(schema['calls.video_provider'], 'cloudflare'),
    ).toBeNull();
    expect(
      validateConfigValue(schema['calls.video_provider'], 'zoom'),
    ).not.toBeNull();
    expect(schema['calls.sfu_max_participants'].defaultValue).toBe(20);
    expect(schema['calls.sfu_fallback_mesh_max'].defaultValue).toBe(4);
    expect(schema['calls.sfu_fallback_mode']).toBeUndefined();
    expect(schema['calls.max_participants'].defaultValue).toBe(9);
  });
});
