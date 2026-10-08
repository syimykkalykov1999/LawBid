-- Owner 2026-10-07: "the unspent part of your promotion went back to your card".
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'promotion_refunded';
