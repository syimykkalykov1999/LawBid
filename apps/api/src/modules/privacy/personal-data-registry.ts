/**
 * Owner 2026-10-29: the personal-data stores registry.
 *
 * ONE place that lists every place a person's data lives, and what happens
 * to it when the account is erased (GDPR Art. 17 / CCPA "right to delete").
 * `PersonalDataErasureService` walks this list; `personal-data-registry.spec`
 * fails when a Prisma model with a user reference is not listed here, so a
 * new table can never silently escape deletion.
 *
 * Two parts:
 *  1. MODEL_POLICY   every Prisma model that points at a user, with its fate.
 *  2. EXTERNAL_STORES  everything that is not a plain table: search engine,
 *     Redis, object storage (+ image variants), CDN caches, Bunny videos,
 *     push tokens, analytics, exports, ledger, audit log, legal holds.
 *
 * Practice this follows (2025-2026): EDPB coordinated enforcement on
 * Art. 17 (report Feb 2026): removing the login is not erasure, pseudonymised
 * leftovers must be justified, backups need a documented "beyond use" plan;
 * Stripe "Delete a customer" (payments stay for finance); Meta/Google style
 * "delete now, finance + security logs kept, backups age out".
 */

export type ErasurePolicy =
  /** Rows of the person are deleted (swept in every database). */
  | 'erase'
  /** Row stays, the personal text/identity inside is blanked. */
  | 'scrub'
  /** Row stays and points at the pseudonymized user row ("Deleted User");
   * it is content others rely on (cases, bids, comments, counters). */
  | 'pseudonymize'
  /** Financial record, kept for tax/accounting law (user row anonymized). */
  | 'retain_ledger'
  /** Security / audit / consent trail, kept (5-year retention). */
  | 'retain_audit'
  /** Kept on a legal basis (fraud prevention, legal hold, CSAM evidence). */
  | 'retain_legal';

export const ERASURE_POLICIES: readonly ErasurePolicy[] = [
  'erase',
  'scrub',
  'pseudonymize',
  'retain_ledger',
  'retain_audit',
  'retain_legal',
];

/** Models whose rows of the person are deleted by the registry sweep.
 * `fields` are uuid columns; a row matching ANY of them is deleted. Only
 * leaf tables (no dependent rows) are listed here. */
export const SWEEPS: Readonly<Record<string, readonly string[]>> = {
  // user family (swept in every database)
  Notification: ['user_id'],
  NotificationSetting: ['user_id'],
  NotificationQuietHours: ['user_id'],
  PushToken: ['user_id'],
  VoipToken: ['user_id'],
  SavedItem: ['user_id'],
  SavedChatMessage: ['user_id'],
  UserBlock: ['blocker_id', 'blocked_id'],
  StoryView: ['viewer_id'],
  StoryHidden: ['owner_id', 'hidden_user_id'],
  StorySetting: ['user_id'],
  ContactMatch: ['owner_id', 'matched_id'],
  ContactSyncSetting: ['user_id'],
  ContactBookHash: ['owner_id'],
  CallLogHidden: ['user_id'],
  UserStickerPack: ['user_id'],
  UserRecentSticker: ['user_id'],
  ChatGroupTopicRead: ['user_id'],
  PostView: ['user_id'],
  PostViewEvent: ['viewer_id'],
  ChannelPostView: ['user_id'],
  ChannelPostShare: ['user_id'],
  PromotionView: ['user_id'],
  CaseRead: ['user_id'],
  MessageHidden: ['user_id'],
  NewCaseAlertPractice: ['attorney_id'],
  BidDraft: ['attorney_id'],
  ChatGroupJoinRequest: ['user_id'],
  ConsultationWindow: ['attorney_id'],
  ConsultationTimeOff: ['attorney_id'],
  // global family (swept once, on the primary database)
  WebauthnCredential: ['user_id'],
  UserIdentifier: ['user_id'],
  UserPrivacySettings: ['user_id'],
  OnboardingState: ['user_id'],
  DataExportJob: ['user_id'],
  UserActivityDay: ['user_id'],
  SearchQueryLog: ['user_id'],
  SearchClick: ['user_id'],
  // Ranking analytics (impressions / clicks per user): personal, swept.
  RankingEvent: ['user_id'],
  // Internal domain-event stream (events pipeline): the actor's own events, swept.
  DomainEvent: ['actor_user_id'],
};

const list = (...models: string[]): string[] => models;

/** policy -> models. A model is in exactly one list (spec checks). */
/** Registered models WITHOUT a direct user column: the person's own row, or a
 * child reached through its parent (request, message). They are handled with
 * the parent, so the dead-entry check skips them. */
export const VIA_PARENT: readonly string[] = [
  'User',
  'VerificationDocument',
  'VerificationCheck',
  'MessageEdit',
];

export const MODEL_POLICY: Readonly<Record<ErasurePolicy, readonly string[]>> =
  {
    erase: list(
      ...Object.keys(SWEEPS),
      // Removed by AccountAnonymizationService itself (transaction / release)
      'Story',
      'ConsultationSettings',
      'Follow',
      'VideoAsset',
      'File',
      'ConnectedCustomer',
    ),
    scrub: list(
      'VerificationRequest',
      'VerificationDocument',
      'ClientVerification',
      'AttorneyLicense',
      'AttorneyPracticeArea',
      'User',
      'ClientProfile',
      'AttorneyProfile',
      'VerificationCheck',
      'Message',
      'MessageEdit',
      'ChatGroupMessage',
      'ChatGroupMember',
      'Post',
      'ChannelPost',
      'LegalQuestion',
      'LegalAnswer',
      'Session',
      'Consultation',
      'AttorneyTask',
      'AttorneyTaskPerson',
      'SupportMessage',
      'SupportTicket',
      'Username',
      'UsernameHold',
      'ContractGrant',
      'DemoAccount',
      'OutreachLead',
      'Partner',
    ),
    pseudonymize: list(
      'StickerPack',
      'CallParticipant',
      'ConversationParticipant',
      'SeatLimitRequest',
      'AssistantRequest',
      'AttorneyProfileView',
      'ChatGroupInvite',
      'Case',
      'Bid',
      'Review',
      'ClientReview',
      'ClientReviewAppeal',
      'ReviewHelpfulVote',
      'ClientReviewHelpfulVote',
      'CasePhoto',
      'CaseTask',
      'CaseTaskItem',
      'CaseTaskEvent',
      'CaseUpdate',
      'CaseComment',
      'CaseCommentLike',
      'CaseShare',
      'CaseInvite',
      'CaseDispute',
      'ContactIssueReport',
      'Conversation',
      'Call',
      'CallVote',
      'MessageReaction',
      'MessagePin',
      'Comment',
      'CommentLike',
      'PostLike',
      'PostRepost',
      'PostShare',
      'ChannelComment',
      'ChannelReaction',
      'ChannelSubscription',
      'ChannelAdmin',
      'Channel',
      'LegalAnswerLike',
      'ChatGroup',
      'ChatGroupTopic',
      'ChatGroupPoll',
      'ChatGroupPollVote',
      'CaseSignRequest',
      'CaseBilling',
      'CaseTimeEntry',
      'CaseExpense',
      'CaseConflictCheck',
      'CasePromotion',
      'AssistantMembership',
      'AssistantActivity',
      'AssistantLiabilityAcceptance',
      'AssistantSeatChange',
      'Firm',
      'FirmMember',
      'OutreachActivity',
      'AttorneyTrust',
      'Report',
      'ModerationAppeal',
      'DmcaNotice',
      'CountryPartner',
      'DocumentTemplate',
    ),
    retain_ledger: list(
      'Payment',
      'Subscription',
      'ClientSubscription',
      'StripeCustomer',
      'CasePayment',
      'CasePaymentRefund',
      'PaymentRequest',
      'CaseInvoice',
      'Refund',
      'StarWallet',
      'StarLedger',
      'StarPurchase',
      'GiftSend',
      'BidPackPurchase',
      'BidCredit',
      'PromoRedemption',
      'ReferralCode',
      'Referral',
      'PartnerCommission',
      'PayrollEmployee',
      'PayrollPayout',
      'PayrollAccrual',
      'PayoutAccount',
      'TreasuryPayout',
      'StaffReward',
      'CountryPartnerSettlement',
      'LedgerAccount',
    ),
    retain_audit: list(
      'AuditLog',
      'AuthEvent',
      'UserConsent',
      'DataAccessLog',
      'DataAccessRequest',
      'CaseJournal',
      'ContactDisclosure',
      'AdminApproval',
      'AdminCredential',
      'AdminProfile',
      'AdminBroadcast',
      'ModerationAction',
      'AccountBan',
      'AttorneyTrustEvent',
      'BarNumberBlock',
      'BarNumberBlockEvent',
      'FileAccessLog',
      'LegalExport',
      // Proof of erasure itself (PR #360 tables): holds only the opaque id.
      'ErasureLedger',
      'DeletionStep',
      // Staff attribution on admin-authored config ("updated_by").
      'FeatureFlag',
      'LegalDocument',
      'AdminRoleTemplate',
      'StateBarRegistry',
      'IntegrationCredential',
      'IntegrationCustomProvider',
      'EmailTemplate',
      'PlanPrice',
      'Plan',
      'FormTemplate',
      'SupportMacro',
      'SupportAgent',
      'OutreachTemplate',
      'OutreachSuppression',
      'PromoCode',
      'Experiment',
    ),
    retain_legal: list(
      'LegalHold',
      'IdentityFingerprint',
      'ClientFraudProfile',
      'ClientFraudEvent',
      'MediaModerationCheck',
      'CsamReport',
    ),
  };

const POLICY_OF = new Map<string, ErasurePolicy>();
for (const [policy, models] of Object.entries(MODEL_POLICY)) {
  for (const m of models) {
    if (!POLICY_OF.has(m)) POLICY_OF.set(m, policy as ErasurePolicy);
  }
}

export function policyOf(model: string): ErasurePolicy | undefined {
  return POLICY_OF.get(model);
}

export function registeredModels(): string[] {
  return Object.values(MODEL_POLICY).flat();
}

// ---------------------------------------------------------------------------
// User-reference detection (used by the spec against Prisma.dmmf)
// ---------------------------------------------------------------------------

const USER_ID_FIELD =
  /(^|_)(user|author|owner|client|attorney|sender|follower|followee|blocker|blocked|creator|actor|viewer|voter|caller|reporter|recipient|target|assignee|admin|partner|referrer|referred|invitee|inviter|holder|subject|matched|employee|appellant)(_user)?_id$/;
const USER_BY_FIELD = /_by$/;

export interface FieldLike {
  name: string;
  kind: string;
  type: string;
  isList?: boolean;
  nativeType?: readonly unknown[] | null;
  relationFromFields?: readonly string[];
}

/** Fields of a model that reference a user: an owning relation to User, or a
 * uuid column named like a user id (`user_id`, `author_id`, `*_by` ...). */
export function userReferenceFields(fields: readonly FieldLike[]): string[] {
  const out: string[] = [];
  for (const f of fields) {
    if (f.kind === 'object') {
      if (f.type === 'User' && (f.relationFromFields?.length ?? 0) > 0) {
        out.push(f.name);
      }
      continue;
    }
    if (f.kind !== 'scalar' || f.type !== 'String' || f.isList) continue;
    if (f.nativeType?.[0] !== 'Uuid') continue;
    if (USER_ID_FIELD.test(f.name) || USER_BY_FIELD.test(f.name)) {
      out.push(f.name);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Non-table stores
// ---------------------------------------------------------------------------

export type StoreKind =
  | 'database'
  | 'search_index'
  | 'redis'
  | 'object_storage'
  | 'cdn_cache'
  | 'video'
  | 'push'
  | 'analytics'
  | 'archive'
  | 'ledger'
  | 'audit'
  | 'legal_hold';

export interface ExternalStore {
  /** Stable id used in the per-store result record. */
  readonly id: string;
  readonly kind: StoreKind;
  readonly policy: ErasurePolicy | 'block';
  readonly description: string;
}

/** Everything that is not a plain Prisma table. Order = execution order. */
export const EXTERNAL_STORES: readonly ExternalStore[] = [
  {
    id: 'legal_hold',
    kind: 'legal_hold',
    policy: 'block',
    description:
      'A legal hold on the person (LegalHold, GDPR Art. 17(3)(e)) blocks the erasure until released.',
  },
  {
    id: 'object_storage',
    kind: 'object_storage',
    policy: 'erase',
    description:
      'S3/R2 objects of the person (avatar, posts, chats, case and verification files, data exports) with every image variant (_w256, _w320, _w1080); shared objects stay for their other owners.',
  },
  {
    id: 'cdn_cache',
    kind: 'cdn_cache',
    policy: 'erase',
    description:
      'CDN copies (Cloudflare purge by URL; CloudFront private media uses expiring signed URLs, optional invalidation hook).',
  },
  {
    id: 'video',
    kind: 'video',
    policy: 'erase',
    description:
      'Bunny Stream videos (reels, stories, channel videos): marked deleted and purged; leftovers go to the videos.sweep.',
  },
  {
    id: 'push',
    kind: 'push',
    policy: 'erase',
    description:
      'Push and VoIP tokens (FCM / APNs): rows deleted, so nothing can be sent to the devices again.',
  },
  {
    id: 'redis',
    kind: 'redis',
    policy: 'erase',
    description:
      'Redis keys: presence, block set, badge counter, idempotency cache; session blacklist entries expire by TTL.',
  },
  {
    id: 'search_index',
    kind: 'search_index',
    policy: 'erase',
    description:
      'Search documents (OpenSearch when search.engine is not postgres): a reindex event is queued for the person; the indexer rebuilds the document from the scrubbed rows.',
  },
  {
    id: 'analytics',
    kind: 'analytics',
    policy: 'erase',
    description:
      'Per-user analytics (user_activity_days, search_query_log, search_clicks, post view events); aggregate app_event_days hold no user id.',
  },
  {
    id: 'archive',
    kind: 'archive',
    policy: 'erase',
    description:
      'Personal exports (data_export_jobs and their files). Legal-request archives (legal_exports) are kept under their own retention.',
  },
  {
    id: 'ledger',
    kind: 'ledger',
    policy: 'retain_ledger',
    description:
      'Payments, stars ledger, commissions, payroll accruals: kept for accounting law, the user behind them is anonymized.',
  },
  {
    id: 'audit',
    kind: 'audit',
    policy: 'retain_audit',
    description:
      'audit_log, auth_events, user_consents, case_journal: kept (5 years), pointing at the pseudonymized user.',
  },
];

/** Stores whose handler is a plain "keep" (nothing to do, only recorded). */
export const RETAINED_STORE_IDS: ReadonlySet<string> = new Set([
  'ledger',
  'audit',
]);

/** Sweeps split by where they run. */
export function sweepModels(isGlobal: (model: string) => boolean): {
  global: string[];
  sharded: string[];
} {
  const global: string[] = [];
  const sharded: string[] = [];
  for (const m of Object.keys(SWEEPS)) (isGlobal(m) ? global : sharded).push(m);
  return { global, sharded };
}
