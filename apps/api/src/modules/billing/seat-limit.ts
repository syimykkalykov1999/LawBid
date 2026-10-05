import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { MAX_ASSISTANT_SEATS, SEATS_HARD_CAP } from './billing.constants';

/** Owner 2026-10-05: how many assistants an attorney may add — the admin
 * setting `billing.max_assistant_seats`, kept within 1..SEATS_HARD_CAP. */
export async function maxAssistantSeats(
  settings?: AppSettingsService,
): Promise<number> {
  const raw = settings
    ? await settings.number('billing.max_assistant_seats')
    : MAX_ASSISTANT_SEATS;
  return Math.min(SEATS_HARD_CAP, Math.max(1, Math.floor(raw)));
}

/** Owner 2026-10-05: the attorney's own limit (an admin approved a
 * request), else the global setting. */
export async function seatLimitFor(
  prisma: Pick<PrismaService, 'attorneyProfile'>,
  attorneyId: string,
  settings?: AppSettingsService,
): Promise<number> {
  const profile = await prisma.attorneyProfile.findUnique({
    where: { user_id: attorneyId },
    select: { assistant_seat_limit: true },
  });
  const own = profile?.assistant_seat_limit;
  return own != null && own > 0
    ? Math.min(SEATS_HARD_CAP, own)
    : maxAssistantSeats(settings);
}
