import {
  buildLinks,
  gcalStamp,
  googleLink,
  outlookLink,
  verifyIcsLink,
} from './calendar-links';
import {
  CalendarApiError,
  CalendarAuthError,
  GoogleCalendarApi,
  MicrosoftCalendarApi,
  googleEventId,
  graphUtc,
  type FetchFn,
} from './calendar-providers';
import { buildIcs } from './ics-builder';
import { taskShape } from './ics-feed.service';
import { absentSides } from './no-show.service';
import { eventHash, wantsExternalEvent } from './calendar-sync.service';

const start = new Date('2026-11-03T19:30:00.000Z');
const end = new Date('2026-11-03T20:00:00.000Z');

describe('add-to-calendar links', () => {
  it('writes Google dates in UTC', () => {
    expect(gcalStamp(start)).toBe('20261103T193000Z');
    const url = googleLink({ uid: 'u', title: 'Call & talk', start, end });
    expect(url).toContain('dates=20261103T193000Z%2F20261103T200000Z');
    expect(url).toContain('text=Call+%26+talk');
  });

  it('a whole day ends on the next day (exclusive)', () => {
    const url = googleLink({ uid: 'u', title: 'Deadline', date: '2026-12-31' });
    expect(url).toContain('dates=20261231%2F20270101');
    expect(outlookLink({ uid: 'u', title: 'x', date: '2026-12-31' })).toContain(
      'allday=true',
    );
  });

  it('signs the ics link and rejects a changed one', () => {
    const links = buildLinks(
      { uid: 'c1', title: 'Consultation', start, end },
      'https://api.example.com/api/v1',
      'secret-secret-secret-secret-secret',
    );
    const q = new URL(links.ics!).searchParams;
    const ok = verifyIcsLink(
      q.get('d')!,
      q.get('sig')!,
      'secret-secret-secret-secret-secret',
    );
    expect(ok?.title).toBe('Consultation');
    expect(ok?.start?.toISOString()).toBe(start.toISOString());
    expect(
      verifyIcsLink(
        q.get('d')! + 'x',
        q.get('sig')!,
        'secret-secret-secret-secret-secret',
      ),
    ).toBeNull();
    expect(
      verifyIcsLink(
        q.get('d')!,
        q.get('sig')!,
        'another-secret-another-secret-aaaa',
      ),
    ).toBeNull();
  });

  it('has no ics link without a signing secret', () => {
    expect(
      buildLinks({ uid: 'c', title: 't', start, end }, 'https://x', undefined)
        .ics,
    ).toBeNull();
  });
});

describe('ICS feed writer', () => {
  const updatedAt = new Date('2026-10-28T10:00:00.000Z');

  it('writes timed events in UTC and whole days as dates', () => {
    const body = buildIcs(
      [
        {
          uid: 'consultation-1@lawbid.app',
          title: 'Consultation: Ann, Lee; "x"',
          category: 'consultation',
          start,
          end,
          updatedAt,
          alarmSeconds: 1800,
        },
        {
          uid: 'case-deadline-9@lawbid.app',
          title: 'Hearing: Smith v. Jones',
          category: 'court',
          date: '2026-12-31',
          updatedAt,
        },
      ],
      { name: 'LawBid', timezone: 'America/New_York' },
    );
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('DTSTART:20261103T193000Z');
    expect(body).toContain('DTEND:20261103T200000Z');
    expect(body).toMatch(/DTSTART;VALUE=DATE:20261231/);
    expect(body).toContain('X-WR-TIMEZONE:America/New_York');
    expect(body).toContain('UID:consultation-1@lawbid.app');
    // commas / semicolons are escaped per RFC 5545
    expect(body).toContain('Ann\\, Lee\\; "x"');
    expect(body).toContain('BEGIN:VALARM');
    expect(body).toContain('CATEGORIES:Court date');
    // every line is folded to at most 75 octets
    for (const line of body.split('\r\n')) {
      expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    }
  });

  it('is deterministic, so an unchanged feed keeps its ETag', () => {
    const ev = [
      {
        uid: 'a@x',
        title: 't',
        category: 'task' as const,
        start,
        end,
        updatedAt,
      },
    ];
    expect(buildIcs(ev, { name: 'LawBid' })).toBe(
      buildIcs(ev, { name: 'LawBid' }),
    );
  });

  it('marks a cancelled consultation CANCELLED without an alarm', () => {
    const body = buildIcs(
      [
        {
          uid: 'c@x',
          title: 't',
          category: 'consultation',
          start,
          end,
          status: 'cancelled',
          updatedAt,
          alarmSeconds: 1800,
        },
      ],
      { name: 'LawBid' },
    );
    expect(body).toContain('STATUS:CANCELLED');
    expect(body).not.toContain('VALARM');
  });

  it('shapes planner kinds', () => {
    expect(taskShape('court').category).toBe('court');
    expect(taskShape('filing').category).toBe('deadline');
    expect(taskShape('call').category).toBe('task');
  });
});

describe('no-show detection', () => {
  const A = 'attorney-1';
  const C = 'client-1';
  it('nobody called: both absent', () => {
    expect(absentSides([], A, C)).toEqual(['attorney', 'client']);
  });
  it('answered call: both present', () => {
    expect(
      absentSides(
        [{ caller_id: C, callee_id: A, answered_at: new Date() }],
        A,
        C,
      ),
    ).toEqual([]);
  });
  it('unanswered call: only the caller was there', () => {
    expect(
      absentSides([{ caller_id: C, callee_id: A, answered_at: null }], A, C),
    ).toEqual(['attorney']);
  });
});

describe('sync rules', () => {
  const now = new Date('2026-11-03T12:00:00Z');
  it('only a confirmed, not long finished consultation is an event', () => {
    expect(wantsExternalEvent({ status: 'confirmed', ends_at: end }, now)).toBe(
      true,
    );
    expect(wantsExternalEvent({ status: 'pending', ends_at: end }, now)).toBe(
      false,
    );
    expect(wantsExternalEvent({ status: 'cancelled', ends_at: end }, now)).toBe(
      false,
    );
    expect(
      wantsExternalEvent(
        { status: 'confirmed', ends_at: new Date('2026-10-01T00:00:00Z') },
        now,
      ),
    ).toBe(false);
  });
  it('changes with the time', () => {
    const a = eventHash({ starts_at: start, ends_at: end }, 't');
    expect(eventHash({ starts_at: start, ends_at: end }, 't')).toBe(a);
    expect(eventHash({ starts_at: end, ends_at: end }, 't')).not.toBe(a);
  });
});

describe('vendors (fake network)', () => {
  const app = { clientId: 'id', clientSecret: 'secret' };
  const reply = (status: number, body: unknown): Response =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
    });

  it('google: free/busy → intervals', async () => {
    const f = jest.fn().mockResolvedValue(
      reply(200, {
        calendars: {
          primary: {
            busy: [
              { start: '2026-11-03T15:00:00Z', end: '2026-11-03T16:00:00Z' },
            ],
          },
        },
      }),
    );
    const busy = await new GoogleCalendarApi(f).freeBusy(
      'tok',
      'primary',
      start,
      end,
    );
    expect(busy).toEqual([
      {
        startsAt: new Date('2026-11-03T15:00:00Z'),
        endsAt: new Date('2026-11-03T16:00:00Z'),
      },
    ]);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://www.googleapis.com/calendar/v3/freeBusy');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer tok',
    );
  });

  it('google: custom event id is valid base32hex and a lost answer (409) updates', async () => {
    expect(googleEventId('3F2A9C1E-0000-4000-8000-ABCDEF012345')).toMatch(
      /^lb[0-9a-f]{32}$/,
    );
    const f = jest
      .fn()
      .mockResolvedValueOnce(reply(409, {}))
      .mockResolvedValueOnce(reply(200, {}));
    const id = await new GoogleCalendarApi(f).upsertEvent(
      'tok',
      'primary',
      null,
      {
        key: 'abcdef01-0000-4000-8000-000000000000',
        title: 't',
        startsAt: start,
        endsAt: end,
      },
    );
    expect(id.startsWith('lb')).toBe(true);
    expect((f.mock.calls[1] as [string, RequestInit])[1].method).toBe('PATCH');
  });

  it('google: a revoked grant is an auth error, a 500 is a plain failure', async () => {
    const api = (r: Response) =>
      new GoogleCalendarApi(jest.fn().mockResolvedValue(r));
    await expect(
      api(reply(400, '{"error":"invalid_grant"}')).refresh(app, 'r'),
    ).rejects.toBeInstanceOf(CalendarAuthError);
    await expect(
      api(reply(500, 'boom')).refresh(app, 'r'),
    ).rejects.toBeInstanceOf(CalendarApiError);
  });

  it('google: deleting an already deleted event is fine', async () => {
    const f = jest.fn().mockResolvedValue(reply(410, {}));
    await expect(
      new GoogleCalendarApi(f as unknown as FetchFn).deleteEvent(
        't',
        'primary',
        'e',
      ),
    ).resolves.toBeUndefined();
  });

  it('microsoft: getSchedule → busy intervals, free time ignored', async () => {
    const f = jest
      .fn()
      .mockResolvedValueOnce(reply(200, { mail: 'a@b.com' }))
      .mockResolvedValueOnce(
        reply(200, {
          value: [
            {
              scheduleItems: [
                {
                  status: 'busy',
                  start: { dateTime: '2026-11-03T15:00:00.0000000' },
                  end: { dateTime: '2026-11-03T16:00:00.0000000' },
                },
                {
                  status: 'free',
                  start: { dateTime: '2026-11-03T17:00:00.0000000' },
                  end: { dateTime: '2026-11-03T18:00:00.0000000' },
                },
              ],
            },
          ],
        }),
      );
    const busy = await new MicrosoftCalendarApi(f).freeBusy(
      'tok',
      'primary',
      start,
      end,
    );
    expect(busy).toHaveLength(1);
    expect(busy[0].startsAt.toISOString()).toBe('2026-11-03T15:00:00.000Z');
  });

  it('microsoft: graph datetimes without a zone are UTC', () => {
    expect(graphUtc('2026-11-03T15:00:00.0000000').toISOString()).toBe(
      '2026-11-03T15:00:00.000Z',
    );
  });

  it('authorize URLs carry the narrow scopes', () => {
    const g = new GoogleCalendarApi().authUrl(app, 'https://x/cb', 's');
    expect(g).toContain('calendar.freebusy');
    expect(g).toContain('calendar.events.owned');
    const m = new MicrosoftCalendarApi().authUrl(
      { ...app, tenant: 'common' },
      'https://x/cb',
      's',
    );
    expect(m).toContain(
      'login.microsoftonline.com/common/oauth2/v2.0/authorize',
    );
    expect(m).toContain('Calendars.ReadWrite');
  });
});
