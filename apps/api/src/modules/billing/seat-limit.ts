import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { EntitlementsService } from '../plans/entitlements.service';
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

/** Owner 2026-10-05: THE one place that answers "how many assistants may
 * this attorney add", so callers never read the limit any other way:
 * 1. the attorney's own limit (an admin approved a request or set it on
 *    Teams) — EntitlementsService folds it into `seats().max`;
 * 2. else the plan's `max_seats` (plan builder, same day), i.e. what the
 *    attorney's live subscription allows;
 * 3. else — no plan, or no EntitlementsService at hand — the admin
 *    setting `billing.max_assistant_seats`.
 * Always within 1..SEATS_HARD_CAP. */
export async function getAssistantLimit(
  prisma: Pick<PrismaService, 'attorneyProfile'>,
  attorneyId: string,
  settings?: AppSettingsService,
  entitlements?: Pick<EntitlementsService, 'seats'>,
): Promise<number> {
  if (entitlements) {
    const max = (await entitlements.seats(attorneyId)).max;
    if (max > 0) return Math.min(SEATS_HARD_CAP, max);
  }
  const profile = await prisma.attorneyProfile.findUnique({
    where: { user_id: attorneyId },
    select: { assistant_seat_limit: true },
  });
  const own = profile?.assistant_seat_limit;
  return own != null && own > 0
    ? Math.min(SEATS_HARD_CAP, own)
    : maxAssistantSeats(settings);
}
