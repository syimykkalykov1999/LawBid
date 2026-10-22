-- Owner 2026-10-22: contacts sync is limited per hour
-- (rate_limit.contacts_sync_per_hour, default 60). The old per-day key is
-- gone; a value saved for it in the admin panel (10) let one pass of the
-- phone book in 100-hash parts use up the whole day.
DELETE FROM "app_config" WHERE "key" = 'rate_limit.contacts_sync_per_day';
