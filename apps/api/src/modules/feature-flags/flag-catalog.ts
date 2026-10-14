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
    key: 'profile_promotion',
    enabled: false,
    app: true,
    description: 'Paid attorney profile promotion',
  },
  {
    key: 'payments_in_app',
    enabled: false,
    app: true,
    description:
      'Clients pay the accepted attorney through the platform (Stripe Connect)',
  },
  {
    key: 'stripe_identity',
    enabled: false,
    app: true,
    description: 'Stripe Identity as a verification provider',
  },
  {
    key: 'persona_verification',
    enabled: false,
    app: true,
    description: 'Persona as a verification provider',
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
  {
    // docs/01 §10.6: App Attest / Play Integrity on otp/request and
    // social login. Keep OFF until real verifiers are configured —
    // the placeholder verifiers reject every token.
    key: 'device_attestation',
    enabled: false,
    description:
      'Require App Attest / Play Integrity on OTP request and social login',
  },
];
