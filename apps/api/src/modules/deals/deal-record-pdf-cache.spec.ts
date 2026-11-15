import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
import {
  DEAL_RECORD_WORD_CACHE_KEY,
  DealRecordPdfCache,
} from './deal-record-pdf-cache';

describe('DealRecordPdfCache (row 145)', () => {
  const settingsReturning = (n: (key: string) => Promise<number>) =>
    ({ number: n }) as unknown as AppSettingsService;

  it('one cache for the process, bounded by the admin setting read before each render', async () => {
    let stored = 1234;
    const read = jest.fn<Promise<number>, [string]>(() =>
      Promise.resolve(stored),
    );
    const holder = new DealRecordPdfCache(settingsReturning(read));
    const a = await holder.current();
    expect(a.maxWords).toBe(1234);
    stored = 0;
    const b = await holder.current();
    expect(b).toBe(a);
    expect(b.maxWords).toBe(0);
    expect(read).toHaveBeenCalledWith(DEAL_RECORD_WORD_CACHE_KEY);
  });

  it('starts at the default and keeps the last bound when the settings cannot be read', async () => {
    let fail = false;
    const holder = new DealRecordPdfCache(
      settingsReturning(() =>
        fail ? Promise.reject(new Error('redis down')) : Promise.resolve(77.9),
      ),
    );
    expect(APP_SETTINGS[DEAL_RECORD_WORD_CACHE_KEY]).toBe(5000);
    expect((await holder.current()).maxWords).toBe(77);
    fail = true;
    expect((await holder.current()).maxWords).toBe(77);
  });

  it('a negative or broken value keeps nothing between records', async () => {
    const holder = new DealRecordPdfCache(
      settingsReturning(() => Promise.resolve(-5)),
    );
    expect((await holder.current()).maxWords).toBe(0);
  });
});
