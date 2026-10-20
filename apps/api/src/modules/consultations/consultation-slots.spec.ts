import {
  generateSlots,
  localDateOf,
  type SlotInput,
} from './consultation-slots';

const base: SlotInput = {
  timeZone: 'America/New_York',
  rules: {
    slotMinutes: 30,
    bufferMinutes: 0,
    minNoticeHours: 0,
    horizonDays: 60,
  },
  // Mondays 09:00-11:00 and 13:00-14:00 (a lunch break between).
  windows: [
    { weekday: 1, startMinute: 540, endMinute: 660 },
    { weekday: 1, startMinute: 780, endMinute: 840 },
  ],
  timeOff: [],
  busy: [],
  now: new Date('2026-10-18T12:00:00Z'), // a Sunday
  fromDate: '2026-10-19', // Monday
  toDate: '2026-10-19',
};
const iso = (d: Date[]) => d.map((x) => x.toISOString());

describe('consultation slots', () => {
  it('lays slots in the attorney zone and leaves the lunch break', () => {
    // EDT = UTC-4.
    expect(iso(generateSlots(base))).toEqual([
      '2026-10-19T13:00:00.000Z',
      '2026-10-19T13:30:00.000Z',
      '2026-10-19T14:00:00.000Z',
      '2026-10-19T14:30:00.000Z',
      '2026-10-19T17:00:00.000Z',
      '2026-10-19T17:30:00.000Z',
    ]);
  });

  it('adds the break between slots', () => {
    const slots = generateSlots({
      ...base,
      rules: { ...base.rules, slotMinutes: 45, bufferMinutes: 15 },
    });
    // 09:00 (45+15), 10:00, then 13:00.
    expect(iso(slots)).toEqual([
      '2026-10-19T13:00:00.000Z',
      '2026-10-19T14:00:00.000Z',
      '2026-10-19T17:00:00.000Z',
    ]);
  });

  it('respects the notice, the horizon and days off', () => {
    const now = new Date('2026-10-19T13:10:00Z'); // 09:10 on the day
    const slots = generateSlots({
      ...base,
      now,
      rules: { ...base.rules, minNoticeHours: 1 },
    });
    // Needs 10:10 or later: 10:30 and the afternoon.
    expect(iso(slots)[0]).toBe('2026-10-19T14:30:00.000Z');
    expect(
      generateSlots({ ...base, rules: { ...base.rules, horizonDays: 0 } }),
    ).toEqual([]);
    expect(
      generateSlots({
        ...base,
        timeOff: [{ startsOn: '2026-10-18', endsOn: '2026-10-19' }],
      }),
    ).toEqual([]);
  });

  it('removes the time a pending or confirmed booking holds (plus the buffer)', () => {
    const busy = [
      {
        startsAt: new Date('2026-10-19T13:30:00Z'),
        endsAt: new Date('2026-10-19T14:00:00Z'),
      },
    ];
    expect(iso(generateSlots({ ...base, busy }))).not.toContain(
      '2026-10-19T13:30:00.000Z',
    );
    const withBuffer = generateSlots({
      ...base,
      busy,
      rules: { ...base.rules, bufferMinutes: 15 },
    });
    // 13:00 slot (to 13:30 + 15 buffer) now touches the booking at 13:30.
    expect(iso(withBuffer)).not.toContain('2026-10-19T13:00:00.000Z');
  });

  it('skips a slot that falls in the hour clocks skip', () => {
    // Sunday 2026-03-08: 02:00-03:00 does not exist in New York.
    const slots = generateSlots({
      ...base,
      windows: [{ weekday: 7, startMinute: 90, endMinute: 240 }],
      fromDate: '2026-03-08',
      toDate: '2026-03-08',
      now: new Date('2026-03-01T00:00:00Z'),
    });
    expect(iso(slots)).toEqual([
      '2026-03-08T06:30:00.000Z', // 01:30 EST
      '2026-03-08T07:00:00.000Z', // 03:00 EDT
      '2026-03-08T07:30:00.000Z', // 03:30 EDT
    ]);
  });

  it('names the attorney-local date of an instant', () => {
    expect(
      localDateOf(new Date('2026-10-20T02:00:00Z'), 'America/New_York'),
    ).toBe('2026-10-19');
  });
});
