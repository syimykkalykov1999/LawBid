import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCommentDto } from '../../modules/comments/comments.dto';
import { configSchema } from '../../modules/admin-config/config-schema';
import { APP_SETTINGS } from './app-settings.defaults';
import { TEXT_LIMIT_DEFS, type TextLimitKey } from './text-limits';
import { TextLimitsService } from './text-limits.service';
import type { AppSettingsService } from './app-settings.service';

/** Owner 2026-10-15: text limits live in app_config, one list. */
describe('text limits', () => {
  const settings = (stored: Record<string, number>) =>
    ({
      number: (k: string) =>
        Promise.resolve(stored[k] ?? APP_SETTINGS[k as TextLimitKey]),
    }) as unknown as AppSettingsService;

  it('every limit has a starter value in the app settings, inside its range', () => {
    for (const [key, d] of Object.entries(TEXT_LIMIT_DEFS)) {
      expect(APP_SETTINGS[key as TextLimitKey]).toBe(d.def);
      expect(d.min).toBeLessThanOrEqual(d.def);
      expect(d.def).toBeLessThanOrEqual(d.max);
    }
  });

  it('the admin editor knows every limit, with its range', () => {
    const schema = configSchema();
    for (const [key, d] of Object.entries(TEXT_LIMIT_DEFS)) {
      expect(schema[key]).toMatchObject({
        type: 'integer',
        min: d.min,
        max: d.max,
      });
    }
  });

  it('max() follows the admin value and stays inside the allowed range', async () => {
    const s = new TextLimitsService(
      settings({
        'limits.comment_chars': 1500,
        'limits.bio_chars': 99_999,
        'limits.review_chars': 0,
      }),
    );
    expect(await s.max('limits.comment_chars')).toBe(1500);
    expect(await s.max('limits.bio_chars')).toBe(
      TEXT_LIMIT_DEFS['limits.bio_chars'].max,
    );
    expect(await s.max('limits.review_chars')).toBe(1);
  });

  it('assert() counts characters like a person (an emoji is one)', async () => {
    const s = new TextLimitsService(settings({ 'limits.comment_chars': 3 }));
    await expect(
      s.assert('limits.comment_chars', '😀😀😀', 'body'),
    ).resolves.toBeUndefined();
    await expect(
      s.assert('limits.comment_chars', '😀😀😀😀', 'body'),
    ).rejects.toMatchObject({
      response: {
        code: 'TEXT_TOO_LONG',
        details: { field: 'body', max: 3, length: 4 },
      },
    });
  });

  it('request validation uses the admin value, not a fixed number', async () => {
    new TextLimitsService(settings({ 'limits.comment_chars': 5 }));
    const dto = (body: string) => plainToInstance(CreateCommentDto, { body });
    expect(await validate(dto('12345'))).toHaveLength(0);
    expect((await validate(dto('123456'))).length).toBeGreaterThan(0);

    new TextLimitsService(settings({ 'limits.comment_chars': 1000 }));
    expect(await validate(dto('x'.repeat(1000)))).toHaveLength(0);
    expect((await validate(dto('x'.repeat(1001)))).length).toBeGreaterThan(0);
  });
});
