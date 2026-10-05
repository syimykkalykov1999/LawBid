import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
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
