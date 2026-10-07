/**
 * Owner 2026-10-07: pre-launch wipe of everything the public beta testers
 * left behind (docs/runbooks/prelaunch-wipe.md). Pure data + helpers so
 * the table selection is unit-tested; the I/O lives in
 * scripts/prelaunch-wipe.ts.
 *
 * Every table of the database must be listed exactly once below. A table
 * the script does not know (a new migration) stops the run: decide first
 * whether it is launch configuration (KEEP) or user data (WIPE).
 */

/**
 * Launch configuration and reference data — never touched. Seeded by
 * prisma/seed.ts (app_config, blocked_email_domains, feature_flags,
 * legal_documents, practice_areas, states, the super admin's users +
 * admin_profiles rows), imported (i18n), or entered by the owner in the
 * admin (prices, plans, templates, keys, staff).
 */
export const KEEP_TABLES: Readonly<Record<string, string>> = {
  _prisma_migrations: 'migration history',
  app_config: 'settings and cost caps (seed + admin)',
  feature_flags: 'feature switches (seed + admin)',
  legal_documents: 'terms / privacy texts (seed + admin)',
  blocked_email_domains: 'disposable e-mail domains (seed)',
  countries: 'where the app works (reference)',
  states: 'US states (seed)',
  practice_areas: 'practice-area tree (seed)',
  state_bar_registries: 'how each state bar is checked (admin)',
  i18n_languages: 'languages (import)',
  i18n_keys: 'translation keys (import)',
  i18n_translations: 'translations (import)',
  i18n_bundle_versions: 'translation bundle versions (the app caches by it)',
  email_templates: 'e-mail texts (admin)',
  plans: 'subscription plans and baselines (admin)',
  plan_prices: 'plan prices / Stripe price ids (admin)',
  promo_codes: 'promo codes the owner made (redeemed_count reset to 0)',
  document_templates:
    'templates the admin publishes (download_count reset to 0)',
  stickers: 'stickers of the official packs (user packs go with them)',
  admin_profiles: 'admin accounts (their users rows are kept)',
  admin_credentials: 'admin logins / passwords / 2FA',
  admin_role_templates: 'admin role presets',
  integration_credentials: 'API keys entered in the admin (encrypted)',
  integration_custom_providers: 'custom services added in the admin',
  support_macros: 'ready support answers (admin)',
  support_agents: 'support shift switches of admins',
  payroll_employees: 'staff on payroll (real people, not testers)',
  payroll_payouts: 'staff salary history',
  payroll_accruals: 'staff salary accruals',
  staff_rewards: 'staff prizes',
  treasury_expenses: 'monthly service costs (owner bookkeeping)',
  treasury_payouts: 'monthly profit / reserve transfers (owner money)',
  partners: 'affiliate partners (owner contracts; their users are kept)',
  country_partners: 'country partners (contracts)',
  country_partner_settlements: 'country partner settlements',
  outreach_leads: 'prospects the team collected (not app users)',
  outreach_activities: 'outreach call / e-mail history',
  outreach_templates: 'outreach e-mail templates',
  outreach_suppressions: 'do-not-contact list (must survive)',
};

/**
 * Tables that are mostly kept but lose their tester rows; handled by
 * explicit DELETEs after the TRUNCATE (see FILTERED_SQL in the script).
 */
export const FILTERED_TABLES: Readonly<Record<string, string>> = {
  users:
    'admins + users still referenced by kept rows (partners, payroll…) stay; everyone else goes',
  files:
    'files still referenced by kept rows (official stickers, document templates, kept avatars) stay',
  sticker_packs: 'official packs (owner_user_id IS NULL) stay; user packs go',
};

/** Everything the testers created. TRUNCATE … CASCADE in one statement. */
export const WIPE_TABLES: Readonly<Record<string, string>> = {
  // identity and sign-in
  user_identifiers: 'phones / e-mails / Apple / Google ids',
  sessions: 'sign-in sessions (admins sign in again)',
  auth_events: 'sign-in history',
  user_consents: 'accepted terms per user',
  onboarding_state: 'onboarding progress',
  push_tokens: 'device push tokens',
  account_bans: 'bans of test phones / devices',
  identity_fingerprints: 'fraud signals',
  client_fraud_profiles: 'fraud scores',
  client_fraud_events: 'fraud history',
  client_verifications: 'client ID checks',
  country_waitlist: 'people waiting for a country',
  // profiles and verification
  client_profiles: 'client profiles',
  attorney_profiles: 'attorney profiles',
  attorney_licenses: 'bar licenses',
  attorney_practice_areas: 'attorney practice areas',
  new_case_alert_practices: 'new-case alert settings',
  verification_requests: 'attorney verification requests',
  verification_documents: 'verification uploads',
  verification_checks: 'verification checks',
  attorney_trust: 'trust scores',
  attorney_trust_events: 'trust history',
  bar_number_blocks: 'bar numbers blocked during the test',
  bar_number_block_events: 'their history',
  // cases and bids
  cases: 'cases',
  case_states: 'case states',
  bids: 'bids',
  bid_offers: 'bid offers',
  bid_drafts: 'bid drafts',
  case_journal: 'case journal (hash chain restarts empty)',
  contact_disclosures: 'contact disclosures',
  contact_issue_reports: 'contact issue reports',
  case_disputes: 'disputes',
  case_photos: 'case photos (rows)',
  case_comments: 'case comments',
  case_comment_likes: 'their likes',
  case_shares: 'case shares',
  case_invites: 'case invites',
  case_promotions: 'paid case / post boosts',
  promotion_views: 'boost impressions',
  reviews: 'reviews of attorneys',
  review_helpful_votes: 'their votes',
  client_reviews: 'reviews of clients',
  client_review_helpful_votes: 'their votes',
  client_review_appeals: 'appeals',
  // social
  posts: 'posts and reels',
  post_media: 'post photos (rows)',
  post_attachments: 'post documents (rows)',
  post_tags: 'post hashtags',
  tags: 'hashtags (all come from posts)',
  post_likes: 'likes',
  post_reposts: 'reposts',
  post_shares: 'shares',
  comments: 'comments',
  comment_likes: 'comment likes',
  follows: 'follows',
  user_blocks: 'blocks',
  saved_items: 'bookmarks',
  video_assets: 'Bunny video rows (videos are deleted in Bunny too)',
  user_sticker_packs: 'installed sticker packs',
  user_recent_stickers: 'recent stickers',
  // chat and calls
  conversations: 'chats',
  conversation_participants: 'chat members',
  messages: 'messages',
  calls: 'calls',
  // notifications
  notifications: 'in-app notifications',
  notification_settings: 'notification settings',
  notification_quiet_hours: 'quiet hours',
  admin_broadcasts: 'pushes sent to testers',
  // assistants and tasks
  assistant_memberships: 'assistant seats',
  assistant_activity: 'assistant activity',
  assistant_requests: 'assistant requests',
  assistant_liability_acceptances: 'assistant liability acceptances',
  attorney_tasks: 'tasks',
  attorney_task_places: 'task places',
  attorney_task_people: 'task people',
  attorney_task_steps: 'task steps',
  seat_limit_requests: 'seat requests',
  contract_grants: 'free subscriptions granted to test accounts',
  // money (test mode)
  stripe_customers: 'Stripe customers',
  subscriptions: 'attorney subscriptions',
  client_subscriptions: 'client subscriptions',
  payments: 'payments',
  refunds: 'refunds',
  stripe_webhook_events: 'Stripe webhook log',
  promo_redemptions: 'promo code uses',
  payout_accounts: 'attorney Stripe Connect accounts',
  connected_customers: 'clients on connected accounts',
  case_payments: 'client → attorney payments',
  payment_requests: 'payment requests',
  case_payment_refunds: 'their refunds',
  referral_codes: 'referral codes',
  referrals: 'referrals',
  partner_commissions: 'commissions earned on test referrals',
  // moderation, support, privacy, admin trail
  reports: 'user reports',
  dmca_notices: 'DMCA notices',
  moderation_actions: 'moderation decisions',
  support_tickets: 'support tickets',
  support_messages: 'support messages',
  data_access_requests: 'law-enforcement requests (test)',
  data_access_log: 'their access log',
  data_export_jobs: '"download my data" jobs',
  audit_log:
    'admin actions of the test period (mostly on tester accounts); the trail starts clean at launch',
  // demo world registry (the demo database itself is reset from the admin)
  demo_accounts: 'demo accounts registry',
  storage_snapshots: 'daily storage statistics of the test period',
};

/** User-id columns WITHOUT a foreign key in kept tables: those users stay
 * (foreign keys are read from the database at run time). */
export const SOFT_USER_REFS: ReadonlyArray<{ table: string; column: string }> =
  [
    { table: 'payroll_employees', column: 'user_id' },
    { table: 'payroll_employees', column: 'admin_user_id' },
    { table: 'partners', column: 'user_id' },
    { table: 'support_agents', column: 'admin_id' },
    { table: 'staff_rewards', column: 'admin_id' },
    { table: 'country_partners', column: 'lead_admin_id' },
  ];

/** Counters on kept rows that only counted tester activity. */
export const RESET_SQL: readonly string[] = [
  'UPDATE "promo_codes" SET "redeemed_count" = 0 WHERE "redeemed_count" <> 0',
  'UPDATE "sticker_packs" SET "install_count" = 0 WHERE "install_count" <> 0',
  'UPDATE "document_templates" SET "download_count" = 0 WHERE "download_count" <> 0',
];

/** S3: every object goes except the keys of kept files rows (and their
 * resized variants `<key>_w<px>`) and the demo world's own prefix. */
export const S3_SKIP_PREFIXES: readonly string[] = ['demo/'];

/**
 * Redis: every key goes except these (glob patterns). Caches rebuild
 * themselves; sessions, OTP state, rate limits, presence, feeds and
 * pending uploads belong to testers.
 */
export const REDIS_KEEP_PATTERNS: readonly string[] = [
  'budget:*', // real spend counters and the 40-day history of «Авто» caps
  'bull:*', // job queues and cron schedules
  'i18n:*', // translation bundle versions (only ever increase)
  'ent:*', // entitlement cache version
  'lock:*', // job locks
  'treasury:*', // treasury run locks / banks
  'demo:*', // demo world locks
];

export type TableClass = 'keep' | 'filtered' | 'wipe';

export function classOf(table: string): TableClass | null {
  if (table in KEEP_TABLES) return 'keep';
  if (table in FILTERED_TABLES) return 'filtered';
  if (table in WIPE_TABLES) return 'wipe';
  return null;
}

/** Tables in more than one list — a mistake in this file. */
export function overlaps(): string[] {
  const seen = new Map<string, number>();
  for (const list of [KEEP_TABLES, FILTERED_TABLES, WIPE_TABLES]) {
    for (const t of Object.keys(list)) seen.set(t, (seen.get(t) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([t]) => t);
}

export interface WipePlan {
  wipe: string[];
  keep: string[];
  filtered: string[];
  /** In the database but in no list: the run stops. */
  unknown: string[];
  /** Listed here but not in the database (an old table): ignored. */
  missing: string[];
}

export function planFor(dbTables: readonly string[]): WipePlan {
  const db = new Set(dbTables);
  const plan: WipePlan = {
    wipe: [],
    keep: [],
    filtered: [],
    unknown: [],
    missing: [],
  };
  for (const t of [...db].sort()) {
    const c = classOf(t);
    if (c === null) plan.unknown.push(t);
    else plan[c].push(t);
  }
  for (const list of [KEEP_TABLES, FILTERED_TABLES, WIPE_TABLES]) {
    for (const t of Object.keys(list)) if (!db.has(t)) plan.missing.push(t);
  }
  plan.missing.sort();
  return plan;
}

export interface ForeignKey {
  fromTable: string;
  fromColumn: string;
  toTable: string;
}

/**
 * TRUNCATE … CASCADE also empties every table that references a
 * truncated one. Returns the foreign keys that would let it reach a table
 * that is not in the wipe list — the run must stop on any.
 */
export function cascadeViolations(
  fks: readonly ForeignKey[],
  wipe: readonly string[],
): ForeignKey[] {
  const w = new Set(wipe);
  return fks.filter((fk) => w.has(fk.toTable) && !w.has(fk.fromTable));
}

/** Converts a Redis glob (only `*`) to a RegExp. */
function globToRegExp(glob: string): RegExp {
  const esc = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${esc}$`);
}

const REDIS_KEEP_RES = REDIS_KEEP_PATTERNS.map(globToRegExp);

export function redisKeyKept(key: string): boolean {
  return REDIS_KEEP_RES.some((re) => re.test(key));
}

/** The group a Redis key is counted under in the dry run. */
export function redisGroup(key: string): string {
  const i = key.indexOf(':');
  return i < 0 ? key : `${key.slice(0, i)}:*`;
}

/** True when [key] belongs to a kept file (the original or a variant). */
export function s3KeyKept(key: string, keptKeys: ReadonlySet<string>): boolean {
  if (S3_SKIP_PREFIXES.some((p) => key.startsWith(p))) return true;
  if (keptKeys.has(key)) return true;
  const m = /^(.*)_w\d+$/.exec(key);
  return m !== null && keptKeys.has(m[1]);
}
