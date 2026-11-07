'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Skeleton } from '@/components/ui/empty';
import { Tabs } from '@/components/ui/tabs';
import type { DeskSettingsView, MyLeases } from '@/lib/desk-data';
import type { DeskRole } from '@/lib/desk';
import { REVIEW_TAB, type ReviewMe } from '@/lib/desk-review';
import { DecisionsTab } from './decisions-tab';
import { DeskEmbed } from './embed';
import { MyItems } from './my-items';
import { MyRating } from './my-rating';
import { ReviewTab } from './review-tab';
import { SupportChatsTab } from './support-chats-tab';
import { TeamPanel } from './team-panel';

// Owner 2026-11-03 (smoothness audit, admin): a desk shows ONE tab at a time,
// but these eight full pages used to be bundled into every /desk/[role]
// load. Each is fetched only when its tab opens (next/dynamic, the same
// pattern as the trust page).
const TabLoading = () => <Skeleton className="h-40 w-full" />;
const ModerationAppealsPage = dynamic(() => import('@/app/(app)/moderation-appeals/page'), { ssr: false, loading: TabLoading });
const ModerationQueuePage = dynamic(() => import('@/app/(app)/moderation/page'), { ssr: false, loading: TabLoading });
const PaymentsPage = dynamic(() => import('@/app/(app)/payments/page'), { ssr: false, loading: TabLoading });
const PayrollPage = dynamic(() => import('@/app/(app)/payroll/page'), { ssr: false, loading: TabLoading });
const ReviewAppealsPage = dynamic(() => import('@/app/(app)/review-appeals/page'), { ssr: false, loading: TabLoading });
const SupportInboxPage = dynamic(() => import('@/app/(app)/support/page'), { ssr: false, loading: TabLoading });
const TreasuryPage = dynamic(() => import('@/app/(app)/treasury/page'), { ssr: false, loading: TabLoading });
const VerificationQueuePage = dynamic(() => import('@/app/(app)/verification/page'), { ssr: false, loading: TabLoading });

/**
 * What each tab shows. The queue tabs are the existing pages of the admin,
 * composed (not copied): same panels, same rules, same rights — only their
 * big titles step aside (DeskEmbed). The personal tabs are new and small.
 */
export function TabBody({
  role,
  tab,
  settings,
  my,
  myLoading,
  myMissing,
  statsOn,
  review,
}: {
  role: DeskRole;
  tab: string;
  settings: DeskSettingsView;
  my: MyLeases | undefined;
  myLoading: boolean;
  myMissing: boolean;
  /** The nightly counters of «Проверено» are readable (worker progress is on). */
  statsOn: boolean;
  /** T9: set only for who may re-check; the tab «Перепроверка» is theirs. */
  review?: ReviewMe | null;
}) {
  if (tab === REVIEW_TAB && review) return <ReviewTab me={review} />;
  if (tab === 'team') return <TeamPanel role={role} enabled={settings.on('staff.lease_enabled')} />;
  if (tab === 'mine' || tab === 'tasks') {
    return <MyItems role={role} settings={settings} my={my} loading={myLoading} missing={myMissing} />;
  }
  if (tab === 'rating') return <MyRating settings={settings} />;
  if (tab === 'checked') return <DecisionsTab enabled={statsOn} />;
  if (tab === 'chats') return <SupportChatsTab settings={settings} />;
  if (tab === 'appeals') return <AppealsTab />;
  return <DeskEmbed>{QUEUE_PAGE[role]?.[tab]?.() ?? null}</DeskEmbed>;
}

const QUEUE_PAGE: Partial<Record<DeskRole, Record<string, () => React.ReactNode>>> = {
  verifier: { queue: () => <VerificationQueuePage /> },
  moderator: { reports: () => <ModerationQueuePage /> },
  support: { tickets: () => <SupportInboxPage /> },
  finance: {
    payouts: () => <PayrollPage />,
    refunds: () => <PaymentsPage />,
    reports: () => <TreasuryPage />,
  },
};

type AppealKind = 'decisions' | 'reviews';

/** «Обжалования»: decisions on posts / comments / messages, and reviews. */
function AppealsTab() {
  const [kind, setKind] = useState<AppealKind>('decisions');
  return (
    <>
      <Tabs<AppealKind>
        size="sm"
        className="mb-4"
        value={kind}
        onChange={setKind}
        items={[
          { value: 'decisions', label: 'Решения' },
          { value: 'reviews', label: 'Отзывы' },
        ]}
      />
      <DeskEmbed>{kind === 'decisions' ? <ModerationAppealsPage /> : <ReviewAppealsPage />}</DeskEmbed>
    </>
  );
}
