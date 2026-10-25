/**
 * Shard-ready step 0 (docs/architecture/SHARDING_READY.md §3, §7): the
 * machine-readable family manifest. EVERY Prisma model is assigned to
 * exactly one family:
 *
 *  - `global`  never sharded; lives on the one primary DB (users, auth,
 *              billing, admin, config, search, analytics ...).
 *  - `case`    colo keyed by the case. Case shard = hash(client_id); every
 *              child (bid, message, call ...) inherits the shard of its parent.
 *  - `user`    colo keyed by the owning user (notifications, saved items,
 *              follows, stories, per-attorney tasks ...).
 *  - `content` colo keyed by the author/owner (posts, channels, legal Q&A,
 *              chat groups).
 *
 * `shard-manifest.spec.ts` fails when a model has no family (or the manifest
 * names a model that no longer exists), and `cross-family-include.spec.ts`
 * fails on a NEW query that includes a relation across families.
 *
 * Sharded models also declare how their shard is found on create
 * (`keys`, tried in order):
 *  - `owner(field)`            shard = hashShard(<user id in field>)
 *  - `parent(field, Model)`    shard = shardOf(<parent id in field>), i.e. the
 *                              parent's shard embedded in its UUIDv8 id (legacy
 *                              v4 parents are looked up by shard_id instead)
 * Each sharded table has a `shard_id smallint` column (migration
 * 20261024140000_shard_id_column).
 */
export type ShardFamily = 'global' | 'case' | 'user' | 'content';
export type ShardedFamily = Exclude<ShardFamily, 'global'>;

export type ShardKey =
  | { readonly kind: 'owner'; readonly field: string }
  | {
      readonly kind: 'parent';
      readonly field: string;
      readonly model: string;
    };

export interface ShardedModelSpec {
  readonly family: ShardedFamily;
  readonly keys: readonly ShardKey[];
}

const owner = (field: string): ShardKey => ({ kind: 'owner', field });
const parent = (field: string, model: string): ShardKey => ({
  kind: 'parent',
  field,
  model,
});
const spec = (
  family: ShardedFamily,
  ...keys: ShardKey[]
): ShardedModelSpec => ({ family, keys });

/** Sharded models (case / user / content families). */
export const SHARDED_MODELS: Readonly<Record<string, ShardedModelSpec>> = {
  // ---- case family: root = Case (shard = hash(client_id)) ----
  Case: spec('case', owner('client_id')),
  CaseState: spec('case', parent('case_id', 'Case')),
  CaseExtraPractice: spec('case', parent('case_id', 'Case')),
  Bid: spec('case', parent('case_id', 'Case')),
  BidOffer: spec('case', parent('bid_id', 'Bid')),
  CaseJournal: spec('case', parent('case_id', 'Case')),
  ContactDisclosure: spec('case', parent('case_id', 'Case')),
  ContactIssueReport: spec('case', parent('case_id', 'Case')),
  CaseDispute: spec('case', parent('case_id', 'Case')),
  Review: spec('case', parent('case_id', 'Case')),
  ReviewHelpfulVote: spec('case', parent('review_id', 'Review')),
  ClientReview: spec('case', parent('case_id', 'Case')),
  ClientReviewHelpfulVote: spec('case', parent('review_id', 'ClientReview')),
  ClientReviewAppeal: spec('case', parent('review_id', 'ClientReview')),
  CasePhoto: spec('case', parent('case_id', 'Case')),
  CaseTask: spec('case', parent('case_id', 'Case')),
  CaseTaskItem: spec('case', parent('task_id', 'CaseTask')),
  CaseTaskEvent: spec('case', parent('case_id', 'Case')),
  CaseRead: spec('case', parent('case_id', 'Case')),
  CaseUpdate: spec('case', parent('case_id', 'Case')),
  CaseComment: spec('case', parent('case_id', 'Case')),
  CaseCommentLike: spec('case', parent('comment_id', 'CaseComment')),
  CaseShare: spec('case', parent('case_id', 'Case')),
  CaseInvite: spec('case', parent('case_id', 'Case')),
  BidDraft: spec('case', parent('case_id', 'Case')),
  CasePayment: spec('case', parent('case_id', 'Case')),
  PaymentRequest: spec('case', parent('case_id', 'Case')),
  CasePaymentRefund: spec('case', parent('payment_id', 'CasePayment')),
  CaseBilling: spec('case', parent('case_id', 'Case')),
  CaseTimeEntry: spec('case', parent('case_id', 'Case')),
  CaseExpense: spec('case', parent('case_id', 'Case')),
  CaseInvoice: spec('case', parent('case_id', 'Case')),
  CaseSignRequest: spec('case', parent('case_id', 'Case')),
  CaseSignature: spec('case', parent('request_id', 'CaseSignRequest')),
  CaseConflictCheck: spec('case', parent('case_id', 'Case')),
  // Consultations / direct chats may have no case: then the client's shard.
  Consultation: spec('case', parent('case_id', 'Case'), owner('client_id')),
  Conversation: spec('case', parent('case_id', 'Case'), owner('client_id')),
  ConversationParticipant: spec(
    'case',
    parent('conversation_id', 'Conversation'),
  ),
  Message: spec('case', parent('conversation_id', 'Conversation')),
  MessageHidden: spec('case', parent('message_id', 'Message')),
  MessageReaction: spec('case', parent('message_id', 'Message')),
  MessageEdit: spec('case', parent('message_id', 'Message')),
  MessagePin: spec('case', parent('conversation_id', 'Conversation')),
  // Group / channel calls have no conversation: the caller's shard.
  Call: spec(
    'case',
    parent('conversation_id', 'Conversation'),
    owner('caller_id'),
  ),
  CallParticipant: spec('case', parent('call_id', 'Call')),
  CallVote: spec('case', parent('call_id', 'Call')),

  // ---- user family: root = the owning user ----
  Notification: spec('user', owner('user_id')),
  NotificationSetting: spec('user', owner('user_id')),
  NotificationQuietHours: spec('user', owner('user_id')),
  PushToken: spec('user', owner('user_id')),
  VoipToken: spec('user', owner('user_id')),
  SavedItem: spec('user', owner('user_id')),
  SavedChatMessage: spec('user', owner('user_id')),
  Follow: spec('user', owner('follower_id')),
  UserBlock: spec('user', owner('blocker_id')),
  Story: spec('user', owner('author_id')),
  StoryView: spec('user', parent('story_id', 'Story')),
  StoryHidden: spec('user', owner('owner_id')),
  StorySetting: spec('user', owner('user_id')),
  ContactMatch: spec('user', owner('owner_id')),
  ContactSyncSetting: spec('user', owner('user_id')),
  ContactBookHash: spec('user', owner('owner_id')),
  CallLogHidden: spec('user', owner('user_id')),
  UserStickerPack: spec('user', owner('user_id')),
  UserRecentSticker: spec('user', owner('user_id')),
  AttorneyTask: spec('user', owner('attorney_id')),
  AttorneyTaskPlace: spec('user', parent('task_id', 'AttorneyTask')),
  AttorneyTaskPerson: spec('user', parent('task_id', 'AttorneyTask')),
  AttorneyTaskStep: spec('user', parent('task_id', 'AttorneyTask')),
  ConsultationSettings: spec('user', owner('attorney_id')),
  ConsultationWindow: spec('user', owner('attorney_id')),
  ConsultationTimeOff: spec('user', owner('attorney_id')),

  // ---- content family: root = author / owner ----
  Post: spec('content', owner('author_id')),
  PostMedia: spec('content', parent('post_id', 'Post')),
  PostAttachment: spec('content', parent('post_id', 'Post')),
  PostTag: spec('content', parent('post_id', 'Post')),
  PostLike: spec('content', parent('post_id', 'Post')),
  PostRepost: spec('content', parent('post_id', 'Post')),
  PostShare: spec('content', parent('post_id', 'Post')),
  PostView: spec('content', parent('post_id', 'Post')),
  PostViewEvent: spec('content', parent('post_id', 'Post')),
  Comment: spec('content', parent('post_id', 'Post')),
  CommentLike: spec('content', parent('comment_id', 'Comment')),
  Channel: spec('content', owner('owner_id')),
  ChannelAdmin: spec('content', parent('channel_id', 'Channel')),
  ChannelSubscription: spec('content', parent('channel_id', 'Channel')),
  ChannelPost: spec('content', parent('channel_id', 'Channel')),
  ChannelPostView: spec('content', parent('post_id', 'ChannelPost')),
  ChannelPostShare: spec('content', parent('post_id', 'ChannelPost')),
  ChannelReaction: spec('content', parent('post_id', 'ChannelPost')),
  ChannelComment: spec('content', parent('post_id', 'ChannelPost')),
  LegalQuestion: spec('content', owner('author_id')),
  LegalAnswer: spec('content', parent('question_id', 'LegalQuestion')),
  LegalAnswerLike: spec('content', parent('answer_id', 'LegalAnswer')),
  // Chat groups are not in the plan's table; they are author-owned content.
  ChatGroup: spec('content', owner('created_by')),
  ChatGroupMember: spec('content', parent('group_id', 'ChatGroup')),
  ChatGroupMessage: spec('content', parent('group_id', 'ChatGroup')),
  ChatGroupTopic: spec('content', parent('group_id', 'ChatGroup')),
  ChatGroupTopicRead: spec('content', parent('topic_id', 'ChatGroupTopic')),
  ChatGroupJoinRequest: spec('content', parent('group_id', 'ChatGroup')),
  ChatGroupInvite: spec('content', parent('group_id', 'ChatGroup')),
  ChatGroupPoll: spec('content', parent('group_id', 'ChatGroup')),
  ChatGroupPollOption: spec('content', parent('poll_id', 'ChatGroupPoll')),
  ChatGroupPollVote: spec('content', parent('poll_id', 'ChatGroupPoll')),
};

/**
 * Global (never sharded) models. Money, auth, admin, moderation, config,
 * reference data, search and analytics: one ledger / one lookup, see plan §3.
 */
/**
 * Global-family models whose table exists on EVERY physical database and is
 * always used through the client of the transaction's own database (the
 * outbox rides in the same transaction as the sharded write). The tx facade
 * leaves them alone.
 */
export const PER_DATABASE_MODELS: ReadonlySet<string> = new Set([
  'CrossFamilyOutbox',
]);

export const GLOBAL_MODELS: readonly string[] = [
  'User',
  'File',
  'FileAccessLog',
  'UserIdentifier',
  'Session',
  'AuthEvent',
  'LegalDocument',
  'UserConsent',
  'OnboardingState',
  'BlockedEmailDomain',
  'FeatureFlag',
  'AppConfig',
  'ShardMap',
  // Step 7: per-physical-database outbox (see PER_DATABASE_MODELS) and the
  // primary-only inbox.
  'CrossFamilyOutbox',
  'CrossFamilyInbox',
  'I18nLanguage',
  'I18nKey',
  'I18nTranslation',
  'I18nBundleVersion',
  'Country',
  'CountryWaitlist',
  'State',
  'PracticeArea',
  'ClientProfile',
  'AttorneyProfile',
  'AttorneyLicense',
  'AttorneyPracticeArea',
  'NewCaseAlertPractice',
  'VerificationRequest',
  'VerificationDocument',
  'VerificationCheck',
  'Tag',
  'StripeCustomer',
  'Subscription',
  'Payment',
  'StripeWebhookEvent',
  'Report',
  'DmcaNotice',
  'ModerationAction',
  'UserPrivacySettings',
  'ModerationAppeal',
  'AdminProfile',
  'AdminRoleTemplate',
  'AccountBan',
  'AuditLog',
  'DataAccessRequest',
  'DataAccessLog',
  'AdminApproval',
  'AdminCredential',
  'WebauthnCredential',
  'DataExportJob',
  'AssistantMembership',
  'AssistantActivity',
  'AssistantRequest',
  'AdminBroadcast',
  'AssistantLiabilityAcceptance',
  'AssistantSeatChange',
  'IntegrationCredential',
  'StateBarRegistry',
  'AttorneyTrust',
  'AttorneyTrustEvent',
  'BarNumberBlock',
  'BarNumberBlockEvent',
  'IntegrationCustomProvider',
  'VideoAsset',
  'ContractGrant',
  'SeatLimitRequest',
  'PromoCode',
  'PromoRedemption',
  'Refund',
  'ReferralCode',
  'Referral',
  'Partner',
  'PartnerCommission',
  'OutreachLead',
  'OutreachActivity',
  'OutreachTemplate',
  'OutreachSuppression',
  'CasePromotion',
  'PromotionDaily',
  'PromotionView',
  'SupportTicket',
  'SupportMessage',
  'SupportMessageFile',
  'SupportMacro',
  'SupportAgent',
  'StaffReward',
  'EmailTemplate',
  'StickerPack',
  'Sticker',
  'StarWallet',
  'StarLedger',
  'StarPurchase',
  'Gift',
  'GiftSend',
  'ClientVerification',
  'PlanPrice',
  'PayrollEmployee',
  'PayrollPayout',
  'PayrollAccrual',
  'TreasuryExpense',
  'TreasuryPayout',
  'PayoutAccount',
  'ConnectedCustomer',
  'DocumentTemplate',
  'Plan',
  'ClientSubscription',
  'DemoAccount',
  'StorageSnapshot',
  'IdentityFingerprint',
  'ClientFraudProfile',
  'ClientFraudEvent',
  'CountryPartner',
  'CountryPartnerSettlement',
  'AttorneyProfileView',
  'BidPackPurchase',
  'BidCredit',
  'Firm',
  'FirmMember',
  'SearchSynonymGroup',
  'SearchSynonymTerm',
  'SearchQueryLog',
  'SearchClick',
  'SearchLearnedLink',
  'AppEventDay',
  'CrashReport',
  'UserActivityDay',
  'BarFormatMiss',
  'FormTemplate',
  'DeadlineRule',
  'CourtHoliday',
  'Username',
  'UsernameHold',
  'LegalExport',
  'LegalHold',
  'MediaModerationCheck',
  'CsamReport',
  'SystemIncident',
  // Search-ready: the engine outbox and its reindex checkpoints.
  'SearchOutbox',
  'SearchIndexState',
  // Day-one foundations: the double-entry money ledger (global: platform
  // accounts and cross-party entries; docs/architecture/MONEY_LEDGER.md).
  'LedgerAccount',
  'LedgerEntry',
  // Stripe robustness 2026-10-27: the admin review queue (global).
  'StripeReviewItem',
  'LedgerLine',
];

const GLOBAL_SET: ReadonlySet<string> = new Set(GLOBAL_MODELS);

/** The family of a model (PascalCase Prisma model name), undefined if unassigned. */
export function familyOf(model: string): ShardFamily | undefined {
  const sharded = SHARDED_MODELS[model];
  if (sharded) return sharded.family;
  return GLOBAL_SET.has(model) ? 'global' : undefined;
}

export function shardSpecOf(model: string): ShardedModelSpec | undefined {
  return SHARDED_MODELS[model];
}

export function isShardedModel(model: string): boolean {
  return model in SHARDED_MODELS;
}

/** Every model name in the manifest. */
export function manifestModels(): string[] {
  return [...Object.keys(SHARDED_MODELS), ...GLOBAL_MODELS];
}
