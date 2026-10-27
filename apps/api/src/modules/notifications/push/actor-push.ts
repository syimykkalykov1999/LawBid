/**
 * Owner 2026-10-26 («уведомления как в WhatsApp, с аватарками»): the
 * person behind a notification that is not a chat message (a bid, a case
 * update, a comment, a like, a follow, a missed call …). The app draws it
 * with their round photo (Android, `push_tokens.actor_style`); the iPhone's
 * notification extension attaches the photo. Pure functions.
 */

/** iOS notification category of chat pushes: «Ответить» / «Прочитано»
 * (registered by the app, AppDelegate.swift). */
export const CHAT_CATEGORY = 'chat_message';

/** `data` (strings only — FCM) for a notification with a person: their
 * name, their photo and its file id (the phone caches the picture by the
 * file, a signed link changes every time). */
export function actorPushData(input: {
  name: string;
  avatar: string | null;
  avatarKey: string | null;
}): Record<string, string> {
  if (!input.name && !input.avatar) return {};
  return {
    style: 'actor',
    actorName: input.name,
    ...(input.avatar
      ? { actorAvatar: input.avatar, actorAvatarKey: input.avatarKey ?? '' }
      : {}),
  };
}
