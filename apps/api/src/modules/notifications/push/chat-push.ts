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
export function chatPushPreview(
  kind: ChatPushKind,
  caption: string,
  ru: boolean,
  durationMs?: number | null,
): string {
  switch (kind) {
    case 'photo':
      return caption ? `📷 ${caption}` : ru ? '📷 Фото' : '📷 Photo';
    case 'video':
      return caption ? `🎥 ${caption}` : ru ? '🎥 Видео' : '🎥 Video';
    case 'file':
      return (ru ? '📎 Файл' : '📎 File') + (caption ? `: ${caption}` : '');
    case 'voice':
      return (
        (ru ? '🎤 Голосовое сообщение' : '🎤 Voice message') +
        (durationMs ? ` ${clock(durationMs)}` : '')
      );
    case 'sticker':
      return ru ? 'Стикер' : 'Sticker';
    case 'gift':
      return ru ? '🎁 Подарок' : '🎁 Gift';
    case 'contact':
      return ru ? '👤 Контакт' : '👤 Contact';
    case 'place':
      return `📍 ${caption}`;
    case 'post':
      return ru ? '📰 Публикация' : '📰 Post';
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
