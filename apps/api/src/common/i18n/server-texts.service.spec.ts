import { afterHoursText } from '../../modules/support/support-hours';
import { PUSH_TEXT_KEYS } from '../../modules/notifications/push/chat-push';
import { ServerTextsService, fillVars } from './server-texts.service';

function make(rows: Record<string, string>) {
  const prisma = {
    i18nTranslation: {
      findFirst: jest.fn(
        ({ where }: { where: { lang: string; i18n_key: { key: string } } }) =>
          Promise.resolve(
            rows[`${where.lang}:${where.i18n_key.key}`] !== undefined
              ? { value: rows[`${where.lang}:${where.i18n_key.key}`] }
              : null,
          ),
      ),
    },
  };
  return { prisma, svc: new ServerTextsService(prisma as never) };
}

describe('ServerTextsService (owner 2026-10-22, audit #4 §4)', () => {
  it('the person’s language first, then its base, then English, then built-in', async () => {
    const { svc } = make({
      'de:call.status.incoming': 'Eingehender Anruf',
      'pt:call.status.incoming': 'Chamada recebida',
      'en:call.ongoing': 'Ongoing call',
    });
    const fb = { en: 'Incoming call', ru: 'Входящий звонок' };
    expect(await svc.text('de', 'call.status.incoming', fb)).toBe(
      'Eingehender Anruf',
    );
    expect(await svc.text('pt-BR', 'call.status.incoming', fb)).toBe(
      'Chamada recebida',
    );
    expect(await svc.text('ja', 'call.ongoing', { en: 'x' })).toBe(
      'Ongoing call',
    );
    expect(await svc.text('ru', 'missing.key', fb)).toBe('Входящий звонок');
    expect(await svc.text('ka', 'missing.key', fb)).toBe('Incoming call');
  });

  it('caches lookups per process', async () => {
    const { svc, prisma } = make({ 'fr:a': 'A' });
    await svc.text('fr', 'a', { en: 'a' });
    await svc.text('fr', 'a', { en: 'a' });
    expect(prisma.i18nTranslation.findFirst).toHaveBeenCalledTimes(1);
  });

  it('fills {placeholders}', async () => {
    const { svc } = make({ 'es:notif.list.mention': '{name} te mencionó' });
    expect(
      await svc.text(
        'es',
        'notif.list.mention',
        { en: '{name} mentioned you' },
        { name: 'Kim' },
      ),
    ).toBe('Kim te mencionó');
    expect(fillVars('{a} {b}', { a: 1 })).toBe('1 {b}');
  });

  it('every push word has a key and en / ru built-ins', () => {
    for (const [, [key, fb]] of Object.entries(PUSH_TEXT_KEYS)) {
      expect(key).toMatch(/^[a-z]+(\.[A-Za-z_]+)+$/);
      expect(fb.en.length).toBeGreaterThan(0);
      expect(fb.ru.length).toBeGreaterThan(0);
    }
  });
});

describe('afterHoursText in every language', () => {
  it('uses the translated template with a localized opening time', () => {
    const at = new Date('2026-10-23T13:00:00Z');
    const text = afterHoursText(
      'de',
      at,
      'America/New_York',
      'Wir sind offline. Antwort: {when}',
    );
    expect(text).toMatch(/^Wir sind offline\. Antwort: Freitag/);
  });

  it('falls back to the built-in sentence without a template', () => {
    const at = new Date('2026-10-23T13:00:00Z');
    expect(afterHoursText('en', at, 'UTC', null)).toContain(
      'Support is offline',
    );
  });
});
