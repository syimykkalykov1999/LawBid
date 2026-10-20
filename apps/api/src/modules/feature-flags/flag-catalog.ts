import { EMAIL_FLOWS_DESCRIPTION } from './email-flows';

/**
 * The ONE list of feature flags. Adding a flag = one entry here:
 *  - the API creates the row on boot when it is missing (an admin's choice
 *    is never overwritten) and `prisma db seed` upserts it;
 *  - `npm run flags:sync` writes the app's first-paint defaults from it
 *    (flags with `app: true`); a unit test fails when the file is stale;
 *  - the admin list is built from the rows, with this description.
 */
export interface FlagDef {
  key: string;
  /** Starter value: the database row, and the app before its first fetch. */
  enabled: boolean;
  description: string;
  /** Part of the app's compiled-in first-paint defaults. */
  app?: boolean;
}

export const FLAG_CATALOG: readonly FlagDef[] = [
  {
    // Owner 2026-10-16: the app must never run at a loss paying third
    // parties. Off = the guard lifts everything it set and stops acting.
    key: 'economy_guard',
    enabled: true,
    description:
      'Economy guard: third-party spend above the rule pauses video uploads, trims SMS and caps autoscaling (admin: Экономика)',
  },
  {
    // Owner 2026-10-15: kill switch for the app's own crash reports. Off:
    // the phone stops sending and the API drops what still arrives.
    key: 'crash_reports',
    enabled: true,
    description: "The app's own crash reports (admin: Вылеты); off = stop",
    app: true,
  },
  {
    // Owner 2026-10-15: the app's own usage events, counted by day. Cheap
    // (batched, counts only), so on by default.
    key: 'app_events',
    enabled: true,
    description: "The app's own usage events (admin: Аналитика); off = stop",
    app: true,
  },
  {
    // Owner 2026-10-15 (Instagram): authors can hide like / view counters of
    // their posts and reels, viewers can hide like counters. Cases keep
    // their bids and comments always.
    key: 'hide_counts',
    enabled: true,
    description: 'Hideable like / view counters on posts and reels',
    app: true,
  },
  {
    // Owner 2026-10-20: stars (balance bought on the web), gifts, paid stickers.
    key: 'stars',
    enabled: false,
    description:
      'Stars: balance bought on the web, gifts in chats, paid sticker packs',
    app: true,
  },
  {
    // Owner 2026-10-14: offer packs bought on top of the monthly limit.
    key: 'bid_packs',
    enabled: false,
    description:
      'Offer packs: attorneys buy extra offers on top of the plan limit',
    app: true,
  },
  {
    // Owner 2026-10-14: a firm is its lawyers (members, union of states).
    key: 'firm_profiles',
    enabled: false,
    description:
      'Firm profiles: a firm adds its lawyers, each with their own licence',
    app: true,
  },
  {
    // Owner 2026-10-05: the video-call button needs a TURN relay.
    key: 'video_calls',
    enabled: false,
    app: true,
    description: 'Video calls in chats (WebRTC, needs a TURN relay)',
  },
  {
    key: 'document_templates',
    enabled: true,
    app: true,
    description: 'Document templates library',
  },
  {
    key: 'web_client',
    enabled: true,
    description: 'Sign-in from the web client (platform = web)',
  },
  {
    key: 'video_posts',
    enabled: false,
    app: true,
    description: 'Video attachments on feed posts',
  },
  {
    key: 'payments_in_app',
    enabled: false,
    app: true,
    description:
      'Clients pay the accepted attorney through the platform (Stripe Connect)',
  },
  {
    // Owner 2026-10-18: the admin shows or hides each «Справочник» section.
    key: 'guide_section_1',
    enabled: true,
    app: true,
    description: 'Guide («Справочник») section 1: What LawBid is',
  },
  {
    // Owner 2026-10-18: the admin shows or hides each «Справочник» section.
    key: 'guide_section_2',
    enabled: true,
    app: true,
    description: 'Guide («Справочник») section 2: Who sees your case',
  },
  {
    // Owner 2026-10-18: the admin shows or hides each «Справочник» section.
    key: 'guide_section_3',
    enabled: true,
    app: true,
    description: 'Guide («Справочник») section 3: Contacts and chat',
  },
  {
    // Owner 2026-10-18: the admin shows or hides each «Справочник» section.
    key: 'guide_section_4',
    enabled: true,
    app: true,
    description: 'Guide («Справочник») section 4: Attorney assistants',
  },
  {
    // Owner 2026-10-18: the admin shows or hides each «Справочник» section.
    key: 'guide_section_5',
    enabled: true,
    app: true,
    description: 'Guide («Справочник») section 5: Files and messages',
  },
  {
    // Owner 2026-10-18: the admin shows or hides each «Справочник» section.
    key: 'guide_section_6',
    enabled: true,
    app: true,
    description:
      'Guide («Справочник») section 6: Bids, case stages and payment',
  },
  {
    // Owner 2026-10-18: the admin shows or hides each «Справочник» section.
    key: 'guide_section_7',
    enabled: true,
    app: true,
    description: 'Guide («Справочник») section 7: Reviews, reports and rules',
  },
  {
    // Owner 2026-10-18: the admin shows or hides each «Справочник» section.
    key: 'guide_section_8',
    enabled: true,
    app: true,
    description: 'Guide («Справочник») section 8: Deleting your account',
  },
  {
    key: 'chat_translate',
    enabled: false,
    app: true,
    description: 'Translate button under chat messages (Google Translate)',
  },
  {
    key: 'payroll_stripe_payouts',
    enabled: false,
    description:
      'Salaries paid out through Stripe Connect (employees link a bank account or card)',
  },
  {
    key: 'auto_bar_check',
    // Retired 2026-10-05: bar lookups are switched on per state in Admin →
    // Ключи и сервисы → "Реестры адвокатов по штатам"; not read any more.
    enabled: false,
    app: true,
    description:
      'Retired: bar lookups are enabled per state in Admin → Integrations → state registries',
  },
  {
    // Owner 2026-10-06: the News system is switched off (kept in code).
    key: 'news_posts',
    enabled: false,
    app: true,
    description:
      'News: the News topic, the Post/News switch and the profile News tab',
  },
  {
    key: 'phone_login',
    enabled: true,
    app: true,
    description: 'Phone/SMS OTP login',
  },
  {
    // Owner 2026-10-13: the «I have a demo code» link on Welcome.
    key: 'demo_code_login',
    enabled: true,
    app: true,
    description: 'The «I have a demo code» link on the Welcome screen',
  },
  {
    // Owner 2026-10-13: sign in with a password, no SMS each time.
    key: 'password_login',
    enabled: true,
    description:
      'Sign in with a phone number or e-mail and a password (no SMS)',
  },
  {
    // Owner 2026-10-07: Admin «Вход и письма по почте» — every e-mail
    // flow in the app (sign-in, adding an e-mail, the client's e-mail
    // step, firm e-mail, e-mail notifications, waiting list). Off until
    // Amazon SES may write to any address (feature-flags/email-flows.ts).
    key: 'email_login',
    enabled: false,
    app: true,
    description: EMAIL_FLOWS_DESCRIPTION,
  },
  {
    key: 'apple_login',
    enabled: true,
    app: true,
    description: 'Sign in with Apple',
  },
  {
    key: 'google_login',
    enabled: true,
    app: true,
    description: 'Sign in with Google',
  },
];
