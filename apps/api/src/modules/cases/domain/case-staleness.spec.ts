import { fillTemplate } from '../../notifications/push/notification-templates';
import {
  askDueAt,
  bidWindowStart,
  canMakeNotUrgent,
  DAY_MS,
  DEFAULT_STALE_TIMERS,
  isClientDaytime,
  loadStaleTimers,
  shouldArchive,
  shouldAsk,
  shouldPause,
  staleKind,
  type StaleFacts,
} from './case-staleness';
import { APP_SETTINGS } from '../../../common/app-settings/app-settings.defaults';

const T = DEFAULT_STALE_TIMERS;
const NOW = new Date('2026-10-18T15:00:00.000Z');
const ago = (days: number, from: Date = NOW) =>
  new Date(from.getTime() - days * DAY_MS);

function facts(over: Partial<StaleFacts> = {}): StaleFacts {
  return {
    urgency: 'flexible',
    deadlineAt: null,
    clientActiveAt: ago(0),
    promptSentAt: null,
    pausedAt: null,
    ...over,
  };
}

describe('stale case timers (OQ-054)', () => {
  const rows: [string, number, number][] = [
    ['very_urgent', 2, 1],
    ['urgent', 4, 2],
    ['soon', 7, 3],
    ['within_month', 30, 4],
    ['flexible', 30, 14],
  ];

  it.each(rows)(
    '%s: ask after %i d, pause %i d later',
    (urgency, ask, pause) => {
      const base = { urgency };
      // Not yet silent long enough, then due.
      expect(
        shouldAsk(facts({ ...base, clientActiveAt: ago(ask - 0.1) }), T, NOW),
      ).toBe(false);
      expect(
        shouldAsk(facts({ ...base, clientActiveAt: ago(ask) }), T, NOW),
      ).toBe(true);
      // Asked: pause only once the second timer ran out.
      const sent = ago(pause - 0.1);
      const asked = facts({
        ...base,
        clientActiveAt: ago(ask + pause),
        promptSentAt: sent,
      });
      expect(shouldPause(asked, T, NOW)).toBe(false);
      expect(shouldPause({ ...asked, promptSentAt: ago(pause) }, T, NOW)).toBe(
        true,
      );
    },
  );

  it('no urgency reads as flexible', () => {
    expect(staleKind(null, null)).toBe('flexible');
    expect(staleKind('by_date', null)).toBe('flexible');
    expect(staleKind('by_date', ago(1))).toBe('by_date');
  });

  it('asks once per silent period', () => {
    const active = ago(40);
    const f = facts({ clientActiveAt: active });
    expect(shouldAsk(f, T, NOW)).toBe(true);
    // Already asked in this period: never again.
    expect(shouldAsk({ ...f, promptSentAt: ago(1) }, T, NOW)).toBe(false);
    // Client acted after the question: a new period, due after 30 d more.
    const back = { ...f, promptSentAt: ago(20), clientActiveAt: ago(10) };
    expect(shouldAsk(back, T, NOW)).toBe(false);
    expect(shouldAsk({ ...back, clientActiveAt: ago(31) }, T, NOW)).toBe(false); // sent after: still outstanding
    // Activity (any) after the question stops the pause.
    expect(shouldPause({ ...back, promptSentAt: ago(20) }, T, NOW)).toBe(false);
  });

  it('a paused case is neither asked nor paused again', () => {
    const f = facts({ clientActiveAt: ago(60), pausedAt: ago(1) });
    expect(shouldAsk(f, T, NOW)).toBe(false);
    expect(shouldPause({ ...f, promptSentAt: ago(30) }, T, NOW)).toBe(false);
  });

  it('by_date: asked once the date has passed, paused N days after the date', () => {
    const deadline = new Date('2026-10-10T00:00:00.000Z');
    const f = facts({
      urgency: 'by_date',
      deadlineAt: deadline,
      clientActiveAt: ago(30),
    });
    // The date itself: not yet passed.
    expect(shouldAsk(f, T, new Date('2026-10-10T20:00:00.000Z'))).toBe(false);
    expect(shouldAsk(f, T, new Date('2026-10-11T00:00:00.000Z'))).toBe(true);
    expect(askDueAt(f, T)?.toISOString()).toBe('2026-10-11T00:00:00.000Z');
    // Pause 3 days after the date (and ≥ 1 day after the question).
    const sent = new Date('2026-10-11T14:00:00.000Z');
    const asked = { ...f, promptSentAt: sent };
    expect(shouldPause(asked, T, new Date('2026-10-12T23:00:00.000Z'))).toBe(
      false,
    );
    expect(shouldPause(asked, T, new Date('2026-10-13T00:00:00.000Z'))).toBe(
      true,
    );
    // The question came late (day 2): still a day of grace.
    const late = { ...f, promptSentAt: new Date('2026-10-12T20:00:00.000Z') };
    expect(shouldPause(late, T, new Date('2026-10-13T10:00:00.000Z'))).toBe(
      false,
    );
    expect(shouldPause(late, T, new Date('2026-10-13T20:00:00.000Z'))).toBe(
      true,
    );
  });

  it('by_date: a client who acted after the date passed is not asked', () => {
    const deadline = new Date('2026-10-10T00:00:00.000Z');
    const f = facts({
      urgency: 'by_date',
      deadlineAt: deadline,
      clientActiveAt: new Date('2026-10-12T00:00:00.000Z'),
    });
    expect(shouldAsk(f, T, NOW)).toBe(false);
  });

  it('bids window: as long as the first timer; a date case since the date passed', () => {
    expect(bidWindowStart(facts({ urgency: 'urgent' }), T, NOW)).toEqual(
      ago(4),
    );
    const d = new Date('2026-10-10T00:00:00.000Z');
    expect(
      bidWindowStart(
        facts({ urgency: 'by_date', deadlineAt: d }),
        T,
        NOW,
      ).toISOString(),
    ).toBe('2026-10-11T00:00:00.000Z');
  });

  it('archives a case paused for 30 days', () => {
    expect(shouldArchive({ pausedAt: ago(29.9) }, T, NOW)).toBe(false);
    expect(shouldArchive({ pausedAt: ago(30) }, T, NOW)).toBe(true);
    expect(shouldArchive({ pausedAt: null }, T, NOW)).toBe(false);
  });

  it('«Не срочно» is offered for urgent cases older than 7 days only', () => {
    expect(canMakeNotUrgent('urgent', ago(8), NOW)).toBe(true);
    expect(canMakeNotUrgent('very_urgent', ago(8), NOW)).toBe(true);
    expect(canMakeNotUrgent('urgent', ago(6), NOW)).toBe(false);
    expect(canMakeNotUrgent('soon', ago(30), NOW)).toBe(false);
    expect(canMakeNotUrgent(null, ago(30), NOW)).toBe(false);
  });

  it('daytime: 09:00–21:00 in the client zone, else US Eastern', () => {
    // 15:00 UTC = 11:00 EDT = 08:00 PDT.
    expect(isClientDaytime(NOW, null)).toBe(true);
    expect(isClientDaytime(NOW, 'America/Los_Angeles')).toBe(false);
    expect(isClientDaytime(new Date('2026-10-19T01:30:00Z'), null)).toBe(false); // 21:30 EDT
    expect(
      isClientDaytime(new Date('2026-10-19T01:30:00Z'), 'America/Los_Angeles'),
    ).toBe(true);
    expect(isClientDaytime(new Date('2026-10-18T12:59:00Z'), null)).toBe(false); // 08:59 EDT
    expect(isClientDaytime(new Date('2026-10-18T13:00:00Z'), null)).toBe(true);
    // An unknown zone falls back to Eastern.
    expect(isClientDaytime(NOW, 'Mars/Olympus')).toBe(true);
  });

  it('every timer is an admin setting whose default equals the built-in one', () => {
    for (const u of [
      'very_urgent',
      'urgent',
      'soon',
      'within_month',
      'flexible',
    ] as const) {
      expect(APP_SETTINGS[`cases.stale_ask_days_${u}`]).toBe(T.askDays[u]);
    }
    for (const u of [
      'very_urgent',
      'urgent',
      'soon',
      'within_month',
      'flexible',
      'by_date',
    ] as const) {
      expect(APP_SETTINGS[`cases.stale_pause_days_${u}`]).toBe(T.pauseDays[u]);
    }
    expect(APP_SETTINGS['cases.stale_archive_after_pause_days']).toBe(30);
  });

  it('loads the admin values, falling back to the defaults', async () => {
    const settings = {
      number: jest.fn((key: string) =>
        Promise.resolve(key === 'cases.stale_ask_days_urgent' ? 9 : 5),
      ),
    };
    const t = await loadStaleTimers(settings as never);
    expect(t.askDays.urgent).toBe(9);
    expect(t.askDays.flexible).toBe(5);
    expect(t.archiveAfterPauseDays).toBe(5);
    await expect(loadStaleTimers(null)).resolves.toEqual(T);
    const broken = { number: jest.fn(() => Promise.reject(new Error('x'))) };
    await expect(loadStaleTimers(broken as never)).resolves.toEqual(T);
  });
});

describe('«{count|…}» plural forms in notification texts', () => {
  const text = (body: string) =>
    fillTemplate({ title: '', body }, { count: 2 });
  it('russian three forms and english two', () => {
    const ru = 'Ждут ответа: {count|кейс|кейса|кейсов}.';
    const at = (n: number) =>
      fillTemplate({ title: '', body: ru }, { count: n }).body;
    expect(at(1)).toBe('Ждут ответа: 1 кейс.');
    expect(at(2)).toBe('Ждут ответа: 2 кейса.');
    expect(at(5)).toBe('Ждут ответа: 5 кейсов.');
    expect(at(11)).toBe('Ждут ответа: 11 кейсов.');
    expect(at(21)).toBe('Ждут ответа: 21 кейс.');
    expect(text('Waiting: {count|case|cases}').body).toBe('Waiting: 2 cases');
    expect(
      fillTemplate({ title: '', body: 'x {count|case|cases}' }, { count: 1 })
        .body,
    ).toBe('x 1 case');
  });
});
