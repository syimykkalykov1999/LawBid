import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { ChatService } from '../chat/chat.service';
import { GroupsService } from '../groups/groups.service';
import type { PushActionDto } from './push-actions.dto';
import { pushActionKey, verifyPushAction } from './push/push-action-token';
import { PushTokensService } from './push/push-tokens.service';

/**
 * Owner 2026-10-26 (pushes like WhatsApp): «Ответить» / «Прочитано» on a
 * chat notification, without opening the app. Accepted only when
 *  - the ticket the push carried is genuine and fresh (48 h), and
 *  - the device sending it (its FCM token) is still signed in to that very
 *    account (a signed-out or revoked device's buttons stop working).
 * Then the reply / read goes through the same chat and group code as in
 * the app (membership, blocks, limits, «who can write» all apply).
 */
@Injectable()
export class PushActionsService {
  private readonly key: Buffer | null;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tokens: PushTokensService,
    private readonly chat: ChatService,
    private readonly groups: GroupsService,
  ) {
    const pepper = config.get<string>('AUTH_EVENT_PEPPER');
    this.key = pepper ? pushActionKey(pepper) : null;
  }

  async act(dto: PushActionDto): Promise<void> {
    const claims = this.key ? verifyPushAction(this.key, dto.token) : null;
    if (!claims) throw refused();
    const device = await this.tokens.deviceSession(dto.fcmToken);
    if (!device || device.userId !== claims.u) throw refused();
    const user = await this.prisma.user.findUnique({
      where: { id: claims.u },
      select: { role: true, status: true },
    });
    if (!user || user.status !== 'active') throw refused();
    // The same claims a fresh sign-in on this device carries.
    const me: RequestUser = {
      sub: claims.u,
      role: user.role,
      sid: device.sessionChainId,
      verified: false,
      subscriptionStatus: 'none',
    };
    const group = claims.g === 1;
    if (dto.action === 'read') {
      if (!dto.messageId) throw invalid('messageId is required');
      if (group) await this.groups.read(me, claims.c, dto.messageId);
      else await this.chat.read(me, claims.c, dto.messageId);
      return;
    }
    const text = (dto.text ?? '').trim();
    if (!text) throw invalid('text is required');
    // A retry of the same reply (no id from an old app) is still one message.
    const clientMessageId =
      dto.clientMessageId ??
      `push-${createHash('sha256')
        .update(`${claims.c}|${dto.messageId ?? ''}|${text}`)
        .digest('hex')
        .slice(0, 32)}`;
    if (group) {
      await this.groups.send(me, claims.c, {
        clientMessageId,
        type: 'text',
        body: text,
      });
    } else {
      await this.chat.send(me, claims.c, {
        clientMessageId,
        type: 'text',
        body: text,
      });
    }
  }
}

function refused(): UnauthorizedException {
  return new UnauthorizedException({
    code: ErrorCode.UNAUTHORIZED,
    message: 'This notification can no longer be answered from here.',
  });
}

function invalid(message: string): BadRequestException {
  return new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message });
}
