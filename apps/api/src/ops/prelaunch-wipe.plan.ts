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
  search_synonym_groups:
    'the search dictionary: words per topic (admin edits it)',
  search_synonym_terms: 'its words and phrases',
  _prisma_migrations: 'migration history',
  app_config: 'settings and cost caps (seed + admin)',
  shard_map:
    'which physical database holds each logical shard (routing config)',
  shard_moves: 'shard move jobs (infrastructure bookkeeping, not tester data)',
  shard_move_track: 'which rows a shard move still has to copy (infra)',
  shard_change_log: 'row changes recorded during a shard move (infra)',
  shard_dropped_fk:
    'foreign keys dropped for sharding (infra, needed to restore)',
  feature_flags: 'feature switches (seed + admin)',
  legal_documents: 'terms / privacy texts (seed + admin)',
  blocked_email_domains: 'disposable e-mail domains (seed)',
  countries: 'where the app works (reference)',
  states: 'US states (seed)',
  deadline_rules: 'deadline calculator rules (seed + admin)',
  court_holidays: 'court holidays for the deadline calculator (seed + admin)',
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
  form_templates: 'document forms the admin publishes (seed + admin)',
  stickers: 'stickers of the official packs (user packs go with them)',
  gifts: 'the gift catalog (admin); sent_count reset to 0',
  admin_profiles: 'admin accounts (their users rows are kept)',
  admin_credentials: 'admin logins / passwords / 2FA',
  // Owner 2026-10-22: admins' passkeys stay; testers' rows go with their
  // users (FK ON DELETE CASCADE from the users filter).
  webauthn_credentials: 'passkeys (admins stay; user rows go with their users)',
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
  // #388 compliance: test-period records
  age_attestations: 'age confirmations given at sign-up (test accounts)',
  email_suppressions:
    'e-mail addresses that bounced / unsubscribed (test period)',
  sms_consents: 'SMS consent records (test accounts)',
  sms_suppressions: 'numbers that answered STOP (test period)',
  // Owner 2026-10-16: shapes of unusual bar numbers typed so far
  bar_format_misses: 'counted shapes of unusual bar numbers (test entries)',
  // identity and sign-in
  user_identifiers: 'phones / e-mails / Apple / Google ids',
  sessions: 'sign-in sessions (admins sign in again)',
  auth_events: 'sign-in history',
  file_access_log: 'who opened a confidential file (journal)',
  user_consents: 'accepted terms per user',
  onboarding_state: 'onboarding progress',
  push_tokens: 'device push tokens',
  voip_tokens: 'iPhone call (VoIP) push tokens',
  account_bans: 'bans of test phones / devices',
  identity_fingerprints: 'fraud signals',
  client_fraud_profiles: 'fraud scores',
  client_fraud_events: 'fraud history',
  client_verifications: 'client ID checks',
  country_waitlist: 'people waiting for a country',
  // consultations and the Ask-a-lawyer board
  consultation_settings: 'attorney booking hours',
  consultation_windows: 'attorney weekly booking windows',
  consultation_time_off: 'attorney time off',
  consultations: 'booked consultations',
  calendar_feed_tokens: 'secret calendar links',
  calendar_connections: 'linked Google / Outlook calendars',
  calendar_event_links: 'events written to linked calendars',
  consultation_no_shows: 'missed-consultation marks',
  consultation_attendance_stats: 'no-show counters',
  legal_questions: 'questions to lawyers',
  legal_answers: 'answers to questions',
  legal_answer_likes: 'likes of answers',
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
  attorney_ad_archive: 'attorney ad text archive',
  attorney_trust_events: 'trust history',
  bar_number_blocks: 'bar numbers blocked during the test',
  bar_number_block_events: 'their history',
  // cases and bids
  cases: 'cases',
  case_states: 'case states',
  case_extra_practices: 'case extra topics',
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
  promotion_daily: 'boost numbers by day',
  search_query_log: 'what testers searched',
  experiments: 'A/B tests of the test period',
  experiment_exposures: 'who saw which variant',
  experiment_results: 'nightly reports of those tests',
  ranking_events:
    'what testers were shown and tapped (weekly partitions go with it)',
  crash_reports: 'crashes of test builds',
  user_activity_days: 'who opened the app on which day (testers)',
  app_event_days: 'app event counts by day (testers)',
  system_incidents: 'status-board outages of the test period',
  search_outbox: 'pending search-engine updates of tester content',
  search_index_state: 'search-engine fill progress (rebuilt by the indexer)',
  search_clicks: 'results testers opened',
  search_learned_links: 'topics learned from tester clicks',
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
  post_views: 'post views',
  post_view_events: 'post view events (post statistics)',
  contact_matches: 'address-book matches',
  contact_book_hashes: 'uploaded phone books (hashes only)',
  contact_sync_settings: 'contacts sync switches',
  case_tasks: 'case tasks',
  case_task_events: 'case task activity',
  case_updates: 'case updates',
  case_task_items: 'case task checklist lines',
  case_billing: 'hourly rates of cases',
  case_time_entries: 'attorney time on cases',
  case_expenses: 'case expenses',
  case_invoices: 'case invoices',
  case_sign_requests: 'documents asked to be signed',
  case_signatures: 'signatures on case documents',
  case_conflict_checks: 'conflict-of-interest checks',
  case_reads: 'case read marks',
  post_shares: 'shares',
  comments: 'comments',
  comment_likes: 'comment likes',
  follows: 'follows',
  user_blocks: 'blocks',
  saved_items: 'bookmarks',
  video_assets: 'Bunny video rows (videos are deleted in Bunny too)',
  user_sticker_packs: 'installed sticker packs',
  user_recent_stickers: 'recent stickers',
  // stories and channels (owner 2026-10-20)
  stories: 'stories',
  story_views: 'story views',
  story_hidden: 'who stories are hidden from',
  story_settings: 'story privacy settings',
  usernames: 'one-namespace username registry (rebuilt from owners)',
  username_holds: 'released-username holds',
  channels: 'channels',
  channel_admins: 'channel admins',
  channel_subscriptions: 'channel subscribers',
  channel_posts: 'channel posts',
  channel_post_views: 'channel post views',
  channel_post_shares: 'channel post shares',
  channel_reactions: 'channel reactions',
  channel_comments: 'channel comments',
  // stars (owner 2026-10-20): test balances, purchases and gifts given
  star_wallets: 'star balances',
  star_ledger: 'star history',
  star_purchases: 'star purchases',
  gift_sends: 'gifts given',
  // chat and calls
  conversations: 'chats',
  conversation_participants: 'chat members',
  messages: 'messages',
  message_edits: 'message edit history',
  message_hidden: 'messages hidden for one person',
  message_pins: 'pinned messages',
  message_search_tokens: 'blind search index of chat message words',
  message_reactions: 'message reactions',
  chat_groups: 'group chats',
  chat_group_members: 'group members',
  chat_group_messages: 'group messages',
  chat_group_topics: 'group topics',
  chat_group_topic_reads: 'read marks per group topic',
  chat_group_join_requests: 'requests to join closed groups',
  chat_group_invites: 'invitations to join a group',
  chat_group_polls: 'polls in groups',
  chat_group_poll_options: 'poll options',
  chat_group_poll_votes: 'poll votes',
  saved_chat_messages: 'saved chat messages',
  calls: 'calls',
  call_participants: 'group call members',
  call_votes: 'votes to remove a member from a group call',
  call_log_hidden: "calls deleted from one person's list",
  // notifications
  notifications: 'in-app notifications',
  cross_family_outbox: 'pending cross-database events (shard-ready step 7)',
  cross_family_inbox: 'applied-event keys (shard-ready step 7)',
  domain_events: 'internal domain-event stream of the test period (N-2)',
  notification_settings: 'notification settings',
  notification_quiet_hours: 'quiet hours',
  admin_broadcasts: 'pushes sent to testers',
  // assistants and tasks
  assistant_memberships: 'assistant seats',
  assistant_activity: 'assistant activity',
  assistant_requests: 'assistant requests',
  assistant_liability_acceptances: 'assistant liability acceptances',
  // Owner 2026-10-22: seat purchases / removals (test payments).
  assistant_seat_changes: 'assistant seat purchases',
  attorney_profile_views: 'profile views',
  bid_pack_purchases: 'offer pack purchases',
  bid_credits: 'bought offers',
  firms: 'firms',
  firm_members: 'firm members',
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
  stripe_review_items:
    'Stripe review queue (disputes, failed payouts, fraud warnings)',
  // money ledger (test-mode entries; TRUNCATE ignores the append-only row triggers)
  ledger_lines: 'money ledger lines (test mode)',
  ledger_entries: 'money ledger entries (test mode)',
  ledger_accounts: 'money ledger accounts (test mode)',
  referral_codes: 'referral codes',
  referrals: 'referrals',
  partner_commissions: 'commissions earned on test referrals',
  // moderation, support, privacy, admin trail
  reports: 'user reports',
  dmca_notices: 'DMCA notices',
  moderation_actions: 'moderation decisions',
  moderation_appeals: 'appeals against moderation decisions',
  reporter_standings: 'reporters warned or paused for unfounded reports',
  user_strikes: 'strikes on content owners',
  moderation_auto_actions: 'automatic moderation decisions and their appeals',
  moderation_detections: 'text classifier log',
  user_privacy_settings: 'privacy settings',
  support_tickets: 'support tickets',
  support_messages: 'support messages',
  support_message_files: 'files attached to support messages',
  data_access_requests: 'law-enforcement requests (test)',
  legal_exports: 'evidence archives of law-enforcement requests (test)',
  legal_holds: 'legal holds of law-enforcement requests (test)',
  data_access_log: 'their access log',
  // Privacy round 13: opaque ids and per-step proof of test-period erasures.
  erasure_ledger: 'erasure ledger of test-period deletions',
  deletion_steps: 'per-step proof of test-period deletions',
  data_export_jobs: '"download my data" jobs',
  audit_log:
    'admin actions of the test period (mostly on tester accounts); the trail starts clean at launch',
  // Owner 2026-10-22: maker-checker requests of the test period.
  admin_approvals:
    'second-admin approvals of test payouts / refunds (pending ones would run on real money)',
  // Owner 2026-10-26: cloud change requests from the admin (infra switches).
  // The applied state lives in growth.auto.tfvars.json on main, not here.
  infra_change_requests:
    'cloud change requests of the test period (plans, confirms, applies); the history starts clean at launch',
  // Owner 2026-10-22: automated media moderation of the test period.
  media_moderation_checks:
    'image / reel-thumbnail moderation verdicts of tester uploads',
  csam_reports:
    'CSAM report records of the test period (real reports are filed with NCMEC, not kept only here)',
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
  'UPDATE "gifts" SET "sent_count" = 0 WHERE "sent_count" <> 0',
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

/** Weekly partitions of ranking_events are the same table as far as the wipe goes. */
const RANKING_PARTITION_RE = /^ranking_events_(p\d{8}|default)$/;

export function classOf(table: string): TableClass | null {
  if (RANKING_PARTITION_RE.test(table)) table = 'ranking_events';
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
