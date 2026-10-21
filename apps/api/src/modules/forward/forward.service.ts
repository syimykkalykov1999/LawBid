import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { ForwardContent } from '../../common/forward/forward-content';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { ChannelsService } from '../channels/channels.service';
import { ChatService } from '../chat/chat.service';
import { GroupsService } from '../groups/groups.service';
import {
  FORWARD_MAX_PAIRS,
  type ForwardMessagesDto,
  type ForwardResponseDto,
  type ForwardResultDto,
  type ForwardSourceDto,
  type ForwardTargetDto,
} from './forward.dto';

/**
 * Owner 2026-10-21 (Telegram / WhatsApp «Переслать»): any message — a
 * chat's, a group's, a channel post — into any chats at once (direct,
 * case, group, channel), several messages in their order, «Forwarded
 * from …» kept. Every source is read-checked first (404 / 403 for the
 * whole request); then each message × chat pair goes through that chat's
 * own send path, so delivery, sockets, pushes and the target's rules
 * (membership, closed chat, blocks, «who can post», channel admins) are
 * exactly those of a normal message. A pair that the target refuses is
 * reported as failed with its error code; the rest still go.
 */
@Injectable()
export class ForwardService {
  private readonly logger = new Logger(ForwardService.name);

  constructor(
    private readonly chat: ChatService,
    private readonly groups: GroupsService,
    private readonly channels: ChannelsService,
  ) {}

  async forward(
    user: RequestUser,
    dto: ForwardMessagesDto,
  ): Promise<ForwardResponseDto> {
    const sources = uniqueBy(dto.sources, (s) => `${s.kind}:${s.id}`);
    const targets = uniqueBy(
      dto.targets,
      (t) => `${t.kind}:${t.id}:${t.topicId ?? ''}`,
    );
    if (sources.length * targets.length > FORWARD_MAX_PAIRS) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `At most ${FORWARD_MAX_PAIRS} messages × chats at once.`,
        details: { max: FORWARD_MAX_PAIRS },
      });
    }
    const contents: { source: ForwardSourceDto; content: ForwardContent }[] =
      [];
    for (const source of sources) {
      contents.push({ source, content: await this.resolve(user, source) });
    }
    const results: ForwardResultDto[] = [];
    for (const target of targets) {
      for (const [i, { source, content }] of contents.entries()) {
        const key = forwardKey(dto.requestId, source, target);
        // Only the last message of the batch rings in each chat.
        const silent = i < contents.length - 1;
        try {
          const messageId = await this.deliver(
            user,
            target,
            key,
            content,
            silent,
          );
          results.push({
            target,
            sourceId: source.id,
            status: 'sent',
            code: null,
            messageId,
          });
        } catch (error) {
          results.push({
            target,
            sourceId: source.id,
            status: 'failed',
            code: this.codeOf(error),
            messageId: null,
          });
        }
      }
    }
    return { results };
  }

  private resolve(
    user: RequestUser,
    source: ForwardSourceDto,
  ): Promise<ForwardContent> {
    switch (source.kind) {
      case 'message':
        return this.chat.forwardSource(user, source.id);
      case 'group_message':
        return this.groups.forwardSource(user, source.id);
      case 'channel_post':
        return this.channels.forwardSource(user, source.id);
      case 'group_link':
        return this.groups.linkSource(user, source.id);
      case 'channel_link':
        return this.channels.linkSource(user, source.id);
    }
  }

  private async deliver(
    user: RequestUser,
    target: ForwardTargetDto,
    key: string,
    content: ForwardContent,
    silent: boolean,
  ): Promise<string> {
    switch (target.kind) {
      case 'conversation':
        return (
          await this.chat.sendForwarded(user, target.id, key, content, {
            silent,
          })
        ).id;
      case 'group':
        return (
          await this.groups.sendForwarded(user, target.id, key, content, {
            topicId: target.topicId,
            silent,
          })
        ).id;
      case 'channel':
        return (
          await this.channels.sendForwarded(user, target.id, key, content, {
            silent,
          })
        ).id;
    }
  }

  private codeOf(error: unknown): string {
    if (error instanceof HttpException) {
      const body = error.getResponse();
      if (typeof body === 'object' && body && 'code' in body) {
        return String(body.code);
      }
      return ErrorCode.VALIDATION_ERROR;
    }
    this.logger.warn(`forward failed: ${String(error)}`);
    return ErrorCode.INTERNAL_ERROR;
  }
}

/** The idempotency key of one message × chat pair of a forward:
 * 'f-' + the first 40 hex of sha256(requestId | source | target). */
export function forwardKey(
  requestId: string,
  source: ForwardSourceDto,
  target: ForwardTargetDto,
): string {
  const hash = createHash('sha256')
    .update(
      `${requestId}|${source.kind}:${source.id}|${target.kind}:${target.id}:${target.topicId ?? ''}`,
    )
    .digest('hex');
  return `f-${hash.slice(0, 40)}`;
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
