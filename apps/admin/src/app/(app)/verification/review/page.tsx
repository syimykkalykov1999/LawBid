'use client';

import { Suspense } from 'react';
import { VerificationReview } from '@/components/review/verification-review';

/** Owner 2026-10-28: attorney requests one after another («…и дальше»). */
export default function VerificationReviewPage() {
  return (
    <Suspense fallback={null}>
      <VerificationReview />
    </Suspense>
  );
}
