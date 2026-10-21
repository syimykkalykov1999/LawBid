import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ErrorCode } from '../errors/error-code.enum';

/**
 * Owner 2026-10-21 (Telegram / WhatsApp «Переслать»): what is forwarded,
 * the same shape for every source — a chat message, a group message, a
 * channel post, or a protected group's / channel's link. Each target's own
 * send path (ChatService / GroupsService / ChannelsService) turns it into
 * its message, so delivery, sockets and pushes stay those of a normal send.
 */
export interface ForwardContent {
  kind:
    | 'text'
    | 'sticker'
    | 'voice'
    | 'attachment'
    | 'contact'
    | 'place'
    | 'gift'
    | 'post';
  /** The text, a caption, an address, a post's body or a link. */
  text: string;
  /** voice / attachment: the source file (copied, never moved). */
  fileId?: string;
  fileName?: string;
  /** attachment: the file's type (a channel takes photos only). */
  mime?: string;
  durationMs?: number;
  waveform?: number[];
  stickerId?: string;
  contactUserId?: string;
  /** post: its photos (post_image files), in order. */
  photoFileIds?: string[];
  /** post with a video: the post's link (a video is not a file). */
  postLink?: string;
  /** A shared feed post (chat message `post`): a card again in a chat. */
  postId?: string;
  /** «Forwarded from <name>»: the first author or channel. */
  fromName: string | null;
  /** A protected group's / channel's link: the forwarder's own message,
   * no «Forwarded» label. */
  own?: boolean;
}

/** 400: the target cannot hold this kind of message. */
export function unsupportedInTarget(): BadRequestException {
  return new BadRequestException({
    code: ErrorCode.UNSUPPORTED_IN_TARGET,
    message: 'This message cannot be sent here.',
  });
}

/** 403: disappearing messages are never forwarded. */
export function forwardNotAllowed(): ForbiddenException {
  return new ForbiddenException({
    code: ErrorCode.FORWARD_NOT_ALLOWED,
    message: 'Disappearing messages cannot be forwarded.',
  });
}

/** 403: the group / channel restricts saving its content. */
export function contentProtected(): ForbiddenException {
  return new ForbiddenException({
    code: ErrorCode.CONTENT_PROTECTED,
    message: 'Forwarding from here is restricted.',
  });
}

/** The client message id of the [part]-th message of one forward (a
 * channel post with three photos makes three chat messages). */
export function forwardPartId(clientMessageId: string, part: number): string {
  return part === 0 ? clientMessageId : `${clientMessageId}-${part}`;
}

/** Up to 120 characters of a «Forwarded from» name, null when empty. */
export function forwardName(
  ...parts: (string | null | undefined)[]
): string | null {
  const name = parts.filter(Boolean).join(' ').trim().slice(0, 120);
  return name.length > 0 ? name : null;
}
