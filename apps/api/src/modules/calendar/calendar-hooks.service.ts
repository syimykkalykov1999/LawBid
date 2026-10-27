import { Injectable } from '@nestjs/common';
import type { Consultation } from '@prisma/client';
import { CalendarBusyService } from './calendar-busy.service';
import { CalendarConfig } from './calendar-config.service';
import { buildLinks, type CalendarLinks } from './calendar-links';
import type { BusyInterval } from './calendar-providers';
import { NoShowService, type NoShowInfo } from './no-show.service';

/**
 * Owner 2026-10-28: the small face the consultation service talks to — so
 * `consultations` has ONE new dependency and none of the calendar insides.
 */
@Injectable()
export class CalendarHooks {
  constructor(
    private readonly busy: CalendarBusyService,
    private readonly cfg: CalendarConfig,
    private readonly noShows: NoShowService,
  ) {}

  /** The attorney's busy time in Google / Outlook ([] when off or failing). */
  externalBusy(
    attorneyId: string,
    from: Date,
    to: Date,
    ignore?: BusyInterval,
  ): Promise<BusyInterval[]> {
    return this.busy.busyFor(attorneyId, from, to, ignore);
  }

  /** «Add to calendar» for one consultation (no private note inside). */
  linksFor(
    c: Pick<Consultation, 'id' | 'starts_at' | 'ends_at'>,
    counterpartName: string,
  ): CalendarLinks {
    return buildLinks(
      {
        uid: `consultation-${c.id}@lawbid.app`,
        title: counterpartName
          ? `LawBid consultation: ${counterpartName}`
          : 'LawBid consultation',
        description: 'Booked in LawBid. Open the chat in the app to call.',
        start: c.starts_at,
        end: c.ends_at,
      },
      this.cfg.apiBase(),
      this.cfg.signingSecret(),
    );
  }

  noShowInfo(
    rows: Consultation[],
    viewerId: string,
  ): Promise<Map<string, NoShowInfo>> {
    return this.noShows.forConsultations(rows, viewerId);
  }
}
