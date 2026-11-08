import { TranslationService } from './translation.service';
import { TRANSLATE_ZONES, type TranslateZone } from './translation-zones';

/** Owner 2026-11-08 (one control): the server spends money for a zone only
 * while the master `chat_translate` is on, the zone is allowed and the
 * Google key is saved — for every zone the app has (chats, posts and
 * comments, cases and bids, reviews, profiles). */
function service(opts: {
  master: boolean;
  config?: Record<string, unknown>;
  key?: string;
}) {
  const flags = {
    isEnabled: jest.fn((key: string) =>
      Promise.resolve(key === 'chat_translate' ? opts.master : false),
    ),
  };
  const secrets = {
    get: jest.fn((id: string) =>
      Promise.resolve(
        id === 'google_translate' && opts.key
          ? { fields: { apiKey: opts.key } }
          : null,
      ),
    ),
  };
  const appConfig = {
    getConfig: jest.fn(() => Promise.resolve(opts.config ?? {})),
  };
  return new TranslationService(
    secrets as never,
    flags as never,
    {} as never,
    { setContext: jest.fn() } as never,
    appConfig as never,
  );
}

const KEY = 'test-google-key';

async function keys(s: TranslationService): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  for (const z of TRANSLATE_ZONES) out[z] = (await s.apiKey(z)) === KEY;
  return out;
}

const every = (v: boolean, except: TranslateZone[] = []) =>
  Object.fromEntries(TRANSLATE_ZONES.map((z) => [z, except.includes(z) ? !v : v]));

describe('translation zones on the server', () => {
  it('master off: no zone gets the key, even with every zone allowed', async () => {
    expect(
      await keys(
        service({
          master: false,
          key: KEY,
          config: { 'translate.scope': 'all' },
        }),
      ),
    ).toEqual(every(false));
  });

  it('master on, «Везде»: every zone', async () => {
    expect(await keys(service({ master: true, key: KEY }))).toEqual(
      every(true),
    );
  });

  it('master on without the key: no zone', async () => {
    expect(await keys(service({ master: true }))).toEqual(every(false));
  });

  it('«Только выбранные»: only the zone switched off is refused', async () => {
    for (const zone of TRANSLATE_ZONES) {
      const s = service({
        master: true,
        key: KEY,
        config: { 'translate.scope': 'zones', [`translate.${zone}`]: false },
      });
      expect(await keys(s)).toEqual(every(true, [zone]));
    }
  });
});
