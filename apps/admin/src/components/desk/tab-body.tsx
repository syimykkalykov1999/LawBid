'use client';

import { useState } from 'react';
import ModerationAppealsPage from '@/app/(app)/moderation-appeals/page';
import ModerationQueuePage from '@/app/(app)/moderation/page';
import PaymentsPage from '@/app/(app)/payments/page';
import PayrollPage from '@/app/(app)/payroll/page';
import ReviewAppealsPage from '@/app/(app)/review-appeals/page';
import SupportInboxPage from '@/app/(app)/support/page';
import TreasuryPage from '@/app/(app)/treasury/page';
import VerificationQueuePage from '@/app/(app)/verification/page';
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
