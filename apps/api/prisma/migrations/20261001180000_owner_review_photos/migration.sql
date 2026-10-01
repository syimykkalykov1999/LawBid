-- Owner 2026-10-01 (Google Maps-style reviews): photos in reviews.
ALTER TYPE file_purpose ADD VALUE IF NOT EXISTS 'review_photo';
