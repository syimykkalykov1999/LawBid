import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PushTokenDto } from './notifications-api.dto';

/** Owner 2026-10-15 (web): a browser registers its push token as `web`. */
describe('PushTokenDto', () => {
  const token = 't'.repeat(40);
  const errors = (platform: string) =>
    validate(plainToInstance(PushTokenDto, { token, platform }));

  it.each(['ios', 'android', 'web'])('accepts %s', async (p) => {
    expect(await errors(p)).toHaveLength(0);
  });

  it('refuses an unknown platform', async () => {
    expect((await errors('desktop')).length).toBeGreaterThan(0);
  });
});
