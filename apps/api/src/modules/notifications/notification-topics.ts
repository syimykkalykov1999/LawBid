import type { NotificationCategory, NotificationType } from '@prisma/client';

/**
 * Owner 2026-10-21 (inbox 30, like Instagram / Telegram): every kind of
 * notification has its own switch in Settings → Notifications (the bell
 * opens the same screen). A topic is either one of the old categories
 * (`category` set: its row in notification_settings is the switch) or a
 * finer switch kept in users.notif_topics; a finer switch nobody touched
 * yet follows the old category of the notification, so the people's
 * earlier choices hold.
 */
export const TOPIC_BLOCKS = [
  'chats',
  'feed',
  'bids',
  'cases',
  'assistants',
  'system',
] as const;
export type TopicBlock = (typeof TOPIC_BLOCKS)[number];

export interface TopicDef {
  key: string;
  block: TopicBlock;
  /** Backed by this old category's switch. */
  category?: NotificationCategory;
  /** Can't be turned off. */
  locked?: boolean;
  /** Only attorneys see and get it. */
  attorneyOnly?: boolean;
  /** Also needs this switch on (the assistants' master switch). */
  parent?: string;
}

export const TOPICS: readonly TopicDef[] = [
  // Chats, groups and channels (per-chat mute lives in each chat).
  { key: 'messages', block: 'chats', category: 'messages' },
  { key: 'groups', block: 'chats', category: 'groups' },
  { key: 'channels', block: 'chats', category: 'channels' },
  { key: 'calls', block: 'chats', category: 'calls' },
  { key: 'chatMentions', block: 'chats' },
  // Feed and follows.
  { key: 'likes', block: 'feed' },
  { key: 'comments', block: 'feed' },
  { key: 'replies', block: 'feed' },
  { key: 'followers', block: 'feed' },
  { key: 'mentions', block: 'feed' },
  { key: 'reactions', block: 'feed' },
  { key: 'following', block: 'feed', category: 'following' },
  // Bids.
  { key: 'bidNew', block: 'bids' },
  { key: 'bidDecision', block: 'bids' },
  // Cases.
  {
    key: 'newCases',
    block: 'cases',
    category: 'new_cases',
    attorneyOnly: true,
  },
  { key: 'caseMessages', block: 'cases' },
  { key: 'caseDeadlines', block: 'cases' },
  { key: 'casePayments', block: 'cases' },
  { key: 'caseUpdates', block: 'cases' },
  { key: 'tasks', block: 'cases' },
  // From my assistants (attorneys).
  { key: 'assistants', block: 'assistants', attorneyOnly: true },
  {
    key: 'assistantCases',
    block: 'assistants',
    attorneyOnly: true,
    parent: 'assistants',
  },
  {
    key: 'assistantBids',
    block: 'assistants',
    attorneyOnly: true,
    parent: 'assistants',
  },
  {
    key: 'assistantTasks',
    block: 'assistants',
    attorneyOnly: true,
    parent: 'assistants',
  },
  {
    key: 'assistantMessages',
    block: 'assistants',
    attorneyOnly: true,
    parent: 'assistants',
  },
  // System: only the serious ones stay locked.
  { key: 'security', block: 'system', locked: true },
  { key: 'account', block: 'system' },
  { key: 'partner', block: 'system' },
  { key: 'news', block: 'system' },
];

export const TOPIC_BY_KEY: ReadonlyMap<string, TopicDef> = new Map(
  TOPICS.map((t) => [t.key, t]),
);
export const TOPIC_KEYS = TOPICS.map((t) => t.key);

/** Which switch every stored notification type follows. A total Record:
 * a new type fails compilation until it is placed. */
export const TYPE_TOPIC: Record<NotificationType, string> = {
  // Bids.
  bid_received: 'bidNew',
  case_invite_received: 'bidNew',
  offer_countered: 'bidDecision',
  offer_accepted: 'bidDecision',
  bid_accepted: 'bidDecision',
  bid_rejected: 'bidDecision',
  negotiation_failed: 'bidDecision',
  case_invite_declined: 'bidDecision',
  // Cases.
  case_comment: 'caseMessages',
  case_workspace_activity: 'caseMessages',
  case_deadline_soon: 'caseDeadlines',
  case_deadline_today: 'caseDeadlines',
  case_deadline_passed: 'caseDeadlines',
  case_deadline_changed: 'caseDeadlines',
  case_payment_received: 'casePayments',
  case_payment_sent: 'casePayments',
  case_payment_refunded: 'casePayments',
  case_payment_disputed: 'casePayments',
  payment_request_created: 'casePayments',
  payment_request_due: 'casePayments',
  payment_request_overdue: 'casePayments',
  payment_request_canceled: 'casePayments',
  payment_fee_countered: 'casePayments',
  payment_fee_agreed: 'casePayments',
  case_updated: 'caseUpdates',
  case_stale_prompt: 'caseUpdates',
  case_still_needed: 'caseUpdates',
  case_archived: 'caseUpdates',
  completion_requested: 'caseUpdates',
  completion_reminder: 'caseUpdates',
  case_closed: 'caseUpdates',
  case_disputed: 'caseUpdates',
  dispute_resolved: 'caseUpdates',
  contact_issue_update: 'caseUpdates',
  review_requested: 'caseUpdates',
  review_received: 'caseUpdates',
  promotion_started: 'caseUpdates',
  promotion_ended: 'caseUpdates',
  consultation_update: 'caseUpdates',
  legal_answer_update: 'caseUpdates',
  task_assigned: 'tasks',
  task_reminder: 'tasks',
  task_purge_soon: 'tasks',
  new_case: 'newCases',
  new_urgent_case: 'newCases',
  legal_question_new: 'newCases',
  // Chats.
  new_message: 'messages',
  assistant_result: 'messages',
  missed_call: 'calls',
  group_invite: 'groups',
  channel_post: 'channels',
  // Feed.
  post_like: 'likes',
  comment_like: 'likes',
  post_comment: 'comments',
  comment_reply: 'replies',
  new_follower: 'followers',
  // "X from your contacts joined LawBid" (social, like a new follower).
  contact_joined: 'followers',
  mention: 'mentions',
  post_repost: 'reactions',
  gift_received: 'reactions',
  followed_post: 'following',
  // From assistants (assistant_request: see topicOf).
  assistant_request: 'assistantMessages',
  assistant_task: 'assistantTasks',
  assistant_bid_draft: 'assistantBids',
  // System.
  security_new_device: 'security',
  security_phone_changed: 'security',
  moderation_notice: 'security',
  subscription_trial_ending: 'security',
  subscription_payment_failed: 'security',
  subscription_status: 'security',
  payout_account_status: 'security',
  partner_payout: 'security',
  partner_commission: 'security',
  verification_update: 'account',
  data_export_ready: 'account',
  case_history_export_ready: 'account',
  assistant_joined: 'account',
  referral_reward: 'partner',
  partner_approved: 'partner',
  partner_declined: 'partner',
  admin_broadcast: 'news',
};

/** The switch of one notification (an assistant's request about a case
 * comment counts as a case). */
export function topicOf(
  type: NotificationType,
  payload?: Record<string, unknown> | null,
): string {
  if (type === 'assistant_request' && payload?.kind === 'case_comment') {
    return 'assistantCases';
  }
  return TYPE_TOPIC[type];
}

/** The user's finer switches (users.notif_topics), unknown keys dropped. */
export function readTopics(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'boolean' && TOPIC_BY_KEY.has(k)) out[k] = v;
    }
  }
  return out;
}

/**
 * Whether [topic] is on. [categoryOn] reads an old category's switch; a
 * finer switch not set yet follows its TOPIC_FALLBACK category.
 */
export function topicOn(
  topic: string,
  topics: Record<string, boolean>,
  categoryOn: (c: NotificationCategory) => boolean,
  ignoreParent = false,
): boolean {
  const def = TOPIC_BY_KEY.get(topic);
  if (!def || def.locked) return true;
  if (!ignoreParent && def.parent && !topicOn(def.parent, topics, categoryOn)) {
    return false;
  }
  if (def.category) return categoryOn(def.category);
  return topics[topic] ?? categoryOn(TOPIC_FALLBACK[topic] ?? 'system');
}

/** The category a finer switch shows until it is set (the old category
 * of its notifications). */
export const TOPIC_FALLBACK: Record<string, NotificationCategory> = {
  chatMentions: 'groups',
  likes: 'social',
  comments: 'social',
  replies: 'social',
  followers: 'social',
  mentions: 'social',
  reactions: 'social',
  bidNew: 'bids',
  bidDecision: 'bids',
  caseMessages: 'cases',
  caseDeadlines: 'cases',
  casePayments: 'cases',
  caseUpdates: 'cases',
  tasks: 'cases',
  assistants: 'system',
  assistantCases: 'cases',
  assistantBids: 'bids',
  assistantTasks: 'cases',
  assistantMessages: 'messages',
  security: 'system',
  account: 'system',
  partner: 'system',
  news: 'system',
};
