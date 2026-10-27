import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ChatSystemMessages,
  type ChatChange,
  type ChatSystemKey,
} from '../../chat/chat-system.service';
import { NotificationsService } from '../../notifications/notifications.service';
import type { RequestUser } from '../../auth/decorators/current-user.decorator';

export type ToolsKind =
  | 'invoice'
  | 'invoice_reminder'
  | 'invoice_overdue'
  | 'sign_request'
  | 'sign_done'
  | 'sign_declined'
  | 'sign_reminder'
  | 'sign_expired';

/** What the three case tools share: the two sides' names, a file placed in
 * the case's Files tab, the line in the case chat, the bell + push. */
@Injectable()
export class CaseToolsSupport {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly chatSystem: ChatSystemMessages,
  ) {}

  async nameOf(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { first_name: true, last_name: true },
    });
    return `${u?.first_name ?? ''} ${u?.last_name ?? ''}`.trim();
  }

  async namesOf(ids: string[]): Promise<Map<string, string>> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, first_name: true, last_name: true },
    });
    return new Map(
      users.map((u) => [
        u.id,
        `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim(),
      ]),
    );
  }

  /** Puts [fileId] in the case's Files tab (both sides read it there). */
  async linkFile(
    tx: Prisma.TransactionClient,
    caseId: string,
    fileId: string,
    userId: string,
    description: string,
  ): Promise<void> {
    const last = await tx.casePhoto.aggregate({
      where: { case_id: caseId },
      _max: { position: true },
    });
    await tx.casePhoto.create({
      data: {
        case_id: caseId,
        file_id: fileId,
        position: (last._max.position ?? -1) + 1,
        description: description.slice(0, 500),
        source: 'case',
        added_by: userId,
      },
    });
  }

  /** A system line in the case chat, inside the caller's transaction. */
  async chatLine(
    tx: Prisma.TransactionClient,
    caseId: string,
    key: ChatSystemKey,
    param?: string,
  ): Promise<ChatChange[]> {
    return this.chatSystem.post(tx, { case_id: caseId }, key, { param });
  }

  publish(changes: ChatChange[]): void {
    this.chatSystem.publish(changes);
  }

  /** The other side's bell and push (category "cases"). */
  async tell(
    user: RequestUser,
    recipientId: string,
    caseId: string,
    kind: ToolsKind,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.notifications.emit(
      {
        type: 'case_workspace_activity',
        recipientId,
        payload: { caseId, actorId: user.sub, kind },
      },
      tx,
    );
  }
}
