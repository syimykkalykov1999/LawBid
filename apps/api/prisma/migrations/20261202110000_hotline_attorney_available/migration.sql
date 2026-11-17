SET LOCAL lock_timeout = '5s';
-- Owner row 87 (hotline plan PR 5): the push «Адвокат на линии — позвонить
-- сейчас?» to a closed app. Only adds an enum value: old builds never write it.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'hotline_attorney_available';
