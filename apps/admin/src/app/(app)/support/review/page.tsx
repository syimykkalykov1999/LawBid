'use client';

import { Suspense } from 'react';
import { SupportReview } from '@/components/review/support-review';

/** Owner 2026-10-28: support conversations one after another («…и дальше»). */
export default function SupportReviewPage() {
  return (
    <Suspense fallback={null}>
      <SupportReview />
    </Suspense>
  );
}
