'use client';

import { Suspense } from 'react';
import { OwnerReview } from '@/components/review/owner-review';

/** Owner 2026-10-28: the owner's decisions one after another («…и дальше»). */
export default function OwnerReviewPage() {
  return (
    <Suspense fallback={null}>
      <OwnerReview />
    </Suspense>
  );
}
