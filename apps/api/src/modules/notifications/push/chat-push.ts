/**
 * Owner 2026-10-22 (message pushes like WhatsApp / Telegram): who a chat
 * push is from and what it says, in one place for 1:1 chats and groups.
 * Pure functions — the dispatcher reads the rows, these turn them into the
 * alert text and the `data` the app draws its own notification from
 * (Android MessagingStyle, the iPhone's Communication Notification).
 */

/** The sender as anyone sees them on LawBid: the display name, else the
 * @username. The name the recipient saved in their phone book is never on
 * the server — the app swaps it in on the device (WhatsApp). */
export interface ChatSender {
  first_name: string | null;
  last_name: string | null;
  avatar_file_id?: string | null;
  client_profile?: { username: string | null } | null;
  attorney_profile?: { username: string | null } | null;
}

export function chatSenderName(sender: ChatSender | null | undefined): string {
  if (!sender) return '';
  const name = [sender.first_name?.trim(), sender.last_name?.trim()]
    .filter(Boolean)
    .join(' ');
  if (name) return name;
  const username =
    sender.attorney_profile?.username ?? sender.client_profile?.username;
  return username ? `@${username}` : '';
}

/** The Prisma `select` that [chatSenderName] needs. */
export const CHAT_SENDER_SELECT = {
  first_name: true,
  last_name: true,
  avatar_file_id: true,
  client_profile: { select: { username: true } },
  attorney_profile: { select: { username: true } },
} as const;

/** What the message is, for the app (`data.kind`) and the alert text. */
export type ChatPushKind =
  | 'text'
  | 'photo'
  | 'video'
  | 'file'
  | 'voice'
  | 'sticker'
  | 'gift'
  | 'contact'
  | 'place'
  | 'post'
  | 'poll';

/** A chat / group message type (+ the attached file's mime) → its kind. */
export function chatPushKind(type: string, mime?: string | null): ChatPushKind {
  if (type === 'attachment') {
    if (mime?.startsWith('image/')) return 'photo';
    if (mime?.startsWith('video/')) return 'video';
    return 'file';
  }
  switch (type) {
    case 'voice':
    case 'sticker':
    case 'gift':
    case 'contact':
    case 'place':
    case 'post':
    case 'poll':
      return type;
    default:
      return 'text';
  }
}

/** «0:12» of a voice note (WhatsApp). */
function clock(ms: number): string {
  return `${Math.floor(ms / 60000)}:${String(
    Math.floor(ms / 1000) % 60,
  ).padStart(2, '0')}`;
}

/**
 * The line a push shows for a message: its text, or what was sent
 * («📷 Фото», «🎥 Видео», «📎 Файл», «🎤 Голосовое сообщение 0:12» …) with
 * the caption when there is one. A file's name stays private (OQ-047).
 */
/** Owner 2026-10-22 (audit #4 §4): the words of a push, in the
 * recipient's language (ServerTextsService). */
export interface ChatPushLabels {
  photo: string;
  video: string;
  file: string;
  voice: string;
  sticker: string;
  gift: string;
  contact: string;
  post: string;
}

const EN_LABELS: ChatPushLabels = {
  photo: 'Photo',
  video: 'Video',
  file: 'File',
  voice: 'Voice message',
  sticker: 'Sticker',
  gift: 'Gift',
  contact: 'Contact',
  post: 'Post',
};
const RU_LABELS: ChatPushLabels = {
  photo: 'Фото',
  video: 'Видео',
  file: 'Файл',
  voice: 'Голосовое сообщение',
  sticker: 'Стикер',
  gift: 'Подарок',
  contact: 'Контакт',
  post: 'Публикация',
};

/**
 * The app's own 85-language keys reused for push texts (the server keeps
 * no second copy): key + the built-in en / ru for before the import.
 */
export const PUSH_TEXT_KEYS = {
  photo: ['chat.attach.photo', { en: 'Photo', ru: 'Фото' }],
  video: ['chat.attach.video', { en: 'Video', ru: 'Видео' }],
  file: ['chat.attach.label', { en: 'File', ru: 'Файл' }],
  voice: [
    'chat.voice.label',
    { en: 'Voice message', ru: 'Голосовое сообщение' },
  ],
  sticker: ['stickers.label', { en: 'Sticker', ru: 'Стикер' }],
  gift: ['gift.giftbox', { en: 'Gift', ru: 'Подарок' }],
  contact: ['card.contact', { en: 'Contact', ru: 'Контакт' }],
  post: ['chat.post.label', { en: 'Post', ru: 'Публикация' }],
  incomingCall: [
    'call.status.incoming',
    { en: 'Incoming call', ru: 'Входящий звонок' },
  ],
  videoCall: ['call.videoButton', { en: 'Video call', ru: 'Видеозвонок' }],
  ongoingCall: ['call.ongoing', { en: 'Ongoing call', ru: 'Идёт звонок' }],
  join: ['group.call.join', { en: 'Join', ru: 'Присоединиться' }],
  assistant: ['auth.welcome.assistant', { en: 'Assistant', ru: 'Помощник' }],
  mentioned: [
    'notif.list.mention',
    { en: '{name} mentioned you', ru: '{name} упомянул(а) вас' },
  ],
  added: [
    'group.system.added',
    { en: '{name} added {people}', ru: '{name} добавил(а) {people}' },
  ],
  reaction: [
    'channel.react.pick',
    { en: 'Reaction {emoji}', ru: 'Реакция {emoji}' },
  ],
} satisfies Record<string, [string, { en: string; ru: string }]>;

export type PushTextName = keyof typeof PUSH_TEXT_KEYS;

export function chatPushPreview(
  kind: ChatPushKind,
  caption: string,
  /** The labels in the recipient's language (true / false = the
   * built-in ru / en ones). */
  labels: ChatPushLabels | boolean,
  durationMs?: number | null,
): string {
  const l =
    typeof labels === 'boolean' ? (labels ? RU_LABELS : EN_LABELS) : labels;
  switch (kind) {
    case 'photo':
      return caption ? `📷 ${caption}` : `📷 ${l.photo}`;
    case 'video':
      return caption ? `🎥 ${caption}` : `🎥 ${l.video}`;
    case 'file':
      return `📎 ${l.file}` + (caption ? `: ${caption}` : '');
    case 'voice':
      return `🎤 ${l.voice}` + (durationMs ? ` ${clock(durationMs)}` : '');
    case 'sticker':
      return l.sticker;
    case 'gift':
      return `🎁 ${l.gift}`;
    case 'contact':
      return `👤 ${l.contact}`;
    case 'place':
      return `📍 ${caption}`;
    case 'post':
      return `📰 ${l.post}`;
    case 'poll':
      return `📊 ${caption}`;
    default:
      return caption;
  }
}

/**
 * The `data` an app draws a WhatsApp-style message notification from
 * (string values only — FCM). `senderAvatarKey` / `chatAvatarKey` are the
 * avatar file ids: the phone caches a picture by them (a signed link
 * changes every time, the file does not).
 */
export function chatPushData(input: {
  senderId: string | null;
  senderName: string;
  senderAvatar: string | null;
  senderAvatarKey: string | null;
  text: string;
  kind: ChatPushKind;
  sentAt: Date;
  group?: { title: string; avatar: string | null; avatarKey: string | null };
}): Record<string, string> {
  return {
    style: 'chat',
    senderId: input.senderId ?? '',
    senderName: input.senderName,
    ...(input.senderAvatar
      ? {
          senderAvatar: input.senderAvatar,
          senderAvatarKey: input.senderAvatarKey ?? '',
        }
      : {}),
    text: input.text,
    kind: input.kind,
    sentAt: String(input.sentAt.getTime()),
    ...(input.group
      ? {
          isGroup: '1',
          chatTitle: input.group.title,
          ...(input.group.avatar
            ? {
                chatAvatar: input.group.avatar,
                chatAvatarKey: input.group.avatarKey ?? '',
              }
            : {}),
        }
      : {}),
  };
}

/**
 * Owner 2026-10-24 (P1 resilience): one collapse key per CONVERSATION, so a
 * burst of messages replaces itself on the phone and the newest text wins:
 *  - iPhone: `apns-collapse-id` (Apple: a newer push with the same id replaces
 *    the alert in the Notification Center and, while the phone is offline, the
 *    stored one - APNs keeps one per id);
 *  - Android (the system shows the notification): FCM `collapse_key` (offline
 *    storage keeps the newest only) and `notification.tag` (replaces the
 *    alert on screen).
 * An Android app that draws chat notifications itself (`chat_style`) is
 * data-only and NOT collapsed (fcm-push.sender): its MessagingStyle needs
 * every line. A @mention in a group uses its own key so a later ordinary
 * message cannot hide it. VoIP call pushes never use this (apns-voip.sender
 * collapses by call id only). Kill switch: env PUSH_CHAT_COLLAPSE=0.
 */
export function chatCollapseKey(
  conversationId: string,
  opts: { mention?: boolean } = {},
): string {
  return `${opts.mention ? 'chatm' : 'chat'}-${conversationId}`;
}

/** APNs limits `apns-collapse-id` to 64 BYTES (not characters). */
export function apnsCollapseId(key: string): string {
  const enc = new TextEncoder();
  if (enc.encode(key).length <= 64) return key;
  let out = '';
  for (const ch of key) {
    if (enc.encode(out + ch).length > 64) break;
    out += ch;
  }
  return out;
}
