-- docs/06_PRODUCTION.md §5 (stage 6.9): user data export ZIP files and the
-- "your export is ready" notification.
ALTER TYPE "file_purpose" ADD VALUE 'data_export';
ALTER TYPE "notification_type" ADD VALUE 'data_export_ready';
