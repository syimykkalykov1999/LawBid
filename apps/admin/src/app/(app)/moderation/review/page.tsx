'use client';

import { Suspense } from 'react';
import { ModerationReview } from '@/components/review/moderation-review';

/** Owner 2026-10-28: complaints one after another («…и дальше»). */
export default function ModerationReviewPage() {
  return (
    <Suspense fallback={null}>
      <ModerationReview />
    </Suspense>
  );
}
