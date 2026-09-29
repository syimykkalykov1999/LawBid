import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { withDeleted } from '../../prisma/soft-delete.extension';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import type {
  CreateDataRequestDto,
  DataPackageDto,
  DataRequestCardDto,
  DataRequestDto,
  DataRequestsPage,
  PackageSection,
  PreparePackageDto,
  UpdateDataRequestStatusDto,
} from './admin-data-requests.dto';

export const DATA_REQUEST_AUDIT = {
  create: 'data_request.create',
  status: 'data_request.status',
  package: 'data_request.package',
} as const;

const LIST_LIMIT = 50;
const MESSAGES_MAX = 5000;

type Row = Prisma.DataAccessRequestGetPayload<{
  include: { _count: { select: { access_log: true } } };
}>;

/**
 * docs/06 §2.3 item 11 / §5.4: a super_admin registers a subpoena or court
 * order, prepares a data package strictly within its scope, and every
 * entity that leaves the system is a `data_access_log` row (append-only).
 * The package is returned as JSON to the panel; it goes out through the
 * official channel, never through the app (file 04 §12).
 */
@Injectable()
export class AdminDataRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async list(cursor?: string): Promise<DataRequestsPage> {
    const c = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.prisma.dataAccessRequest.findMany({
      where: c
        ? {
            OR: [
              { created_at: { lt: c.createdAt } },
              { created_at: c.createdAt, id: { lt: c.id } },
            ],
          }
        : {},
      include: { _count: { select: { access_log: true } } },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: LIST_LIMIT + 1,
    });
    const page = rows.slice(0, LIST_LIMIT);
    const last = page[page.length - 1];
    return {
      items: page.map(present),
      nextCursor:
        rows.length > LIST_LIMIT && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async create(
    admin: AdminActor,
    dto: CreateDataRequestDto,
  ): Promise<DataRequestDto> {
    const row = await withTxRetry(this.prisma, async (tx) => {
      const created = await tx.dataAccessRequest.create({
        data: {
          request_type: dto.requestType,
          reference_number: dto.referenceNumber,
          agency: dto.agency,
          received_at: new Date(dto.receivedAt),
          scope: dto.scope,
          notes: dto.notes ?? null,
          handled_by: admin.id,
          status: 'received',
        },
        include: { _count: { select: { access_log: true } } },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: DATA_REQUEST_AUDIT.create,
          targetType: 'data_access_request',
          targetId: created.id,
          after: {
            requestType: dto.requestType,
            referenceNumber: dto.referenceNumber,
            agency: dto.agency,
          },
          ip: admin.ip,
        },
        tx,
      );
      return created;
    });
    return present(row);
  }

  async card(id: string): Promise<DataRequestCardDto> {
    const row = await this.prisma.dataAccessRequest.findUnique({
      where: { id },
      include: {
        _count: { select: { access_log: true } },
        access_log: { orderBy: { accessed_at: 'desc' }, take: 500 },
      },
    });
    if (!row) throw notFound();
    return {
      ...present(row),
      accessLog: row.access_log.map((l) => ({
        id: l.id,
        adminId: l.admin_id,
        entityType: l.entity_type,
        entityId: l.entity_id,
        accessedAt: l.accessed_at.toISOString(),
      })),
    };
  }

  async setStatus(
    admin: AdminActor,
    id: string,
    dto: UpdateDataRequestStatusDto,
  ): Promise<DataRequestDto> {
    const row = await withTxRetry(this.prisma, async (tx) => {
      const before = await tx.dataAccessRequest.findUnique({ where: { id } });
      if (!before) throw notFound();
      const closed = dto.status === 'fulfilled' || dto.status === 'rejected';
      const updated = await tx.dataAccessRequest.update({
        where: { id },
        data: {
          status: dto.status,
          notes: dto.notes ?? before.notes,
          closed_at: closed ? (before.closed_at ?? new Date()) : null,
        },
        include: { _count: { select: { access_log: true } } },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: DATA_REQUEST_AUDIT.status,
          targetType: 'data_access_request',
          targetId: id,
          before: { status: before.status },
          after: { status: dto.status },
          ip: admin.ip,
        },
        tx,
      );
      return updated;
    });
    return present(row);
  }

  /** The package: every entity returned is logged before the response. */
  async preparePackage(
    admin: AdminActor,
    id: string,
    dto: PreparePackageDto,
  ): Promise<DataPackageDto> {
    const request = await this.prisma.dataAccessRequest.findUnique({
      where: { id },
    });
    if (!request) throw notFound();
    const user = await this.prisma.user.findUnique({
      where: withDeleted({ id: dto.userId }),
      select: {
        id: true,
        role: true,
        status: true,
        first_name: true,
        last_name: true,
        email: true,
        phone_e164: true,
        ui_language: true,
        created_at: true,
        deleted_at: true,
        attorney_profile: { select: { username: true, firm_name: true } },
        client_profile: {
          select: { state_code: true, preferred_contact_method: true },
        },
      },
    });
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'User not found.',
      });
    }
    const sections = [...new Set(dto.sections)];
    const data: Record<string, unknown> = {};
    const log: { entity_type: string; entity_id: string }[] = [
      { entity_type: 'user', entity_id: user.id },
    ];
    const has = (s: PackageSection) => sections.includes(s);

    if (has('profile')) {
      data.profile = {
        id: user.id,
        role: user.role,
        status: user.status,
        firstName: user.first_name,
        lastName: user.last_name,
        uiLanguage: user.ui_language,
        createdAt: user.created_at,
        deletedAt: user.deleted_at,
        attorney: user.attorney_profile,
        client: user.client_profile,
      };
    }
    if (has('contacts')) {
      data.contacts = { email: user.email, phone: user.phone_e164 };
    }
    if (has('cases')) {
      const cases = await this.prisma.case.findMany({
        where:
          user.role === 'attorney'
            ? { accepted_bid: { attorney_id: user.id } }
            : { client_id: user.id },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          primary_state_code: true,
          created_at: true,
          closed_at: true,
          client_id: true,
        },
        orderBy: { created_at: 'asc' },
      });
      data.cases = cases;
      log.push(...cases.map((c) => ({ entity_type: 'case', entity_id: c.id })));
    }
    if (has('bids')) {
      const bids = await this.prisma.bid.findMany({
        where:
          user.role === 'attorney'
            ? { attorney_id: user.id }
            : { case: { client_id: user.id } },
        select: {
          id: true,
          case_id: true,
          attorney_id: true,
          status: true,
          fee_type: true,
          amount_cents: true,
          message: true,
          created_at: true,
        },
        orderBy: { created_at: 'asc' },
      });
      data.bids = bids;
      log.push(...bids.map((b) => ({ entity_type: 'bid', entity_id: b.id })));
    }
    if (has('contact_disclosures')) {
      const disclosures = await this.prisma.contactDisclosure.findMany({
        where: { OR: [{ client_id: user.id }, { attorney_id: user.id }] },
        orderBy: { disclosed_at: 'asc' },
      });
      data.contactDisclosures = disclosures;
      log.push(
        ...disclosures.map((d) => ({
          entity_type: 'contact_disclosure',
          entity_id: d.id,
        })),
      );
    }
    if (has('messages')) {
      const conversations = await this.prisma.conversation.findMany({
        where: { OR: [{ client_id: user.id }, { attorney_id: user.id }] },
        select: {
          id: true,
          case_id: true,
          client_id: true,
          attorney_id: true,
          created_at: true,
        },
      });
      const messages = await this.prisma.message.findMany({
        where: withDeleted({
          conversation_id: { in: conversations.map((c) => c.id) },
        }),
        select: {
          id: true,
          conversation_id: true,
          sender_id: true,
          type: true,
          body_original: true,
          body_display: true,
          created_at: true,
          deleted_at: true,
        },
        orderBy: { created_at: 'asc' },
        take: MESSAGES_MAX,
      });
      data.conversations = conversations;
      data.messages = messages;
      log.push(
        ...conversations.map((c) => ({
          entity_type: 'conversation',
          entity_id: c.id,
        })),
      );
    }

    const preparedAt = new Date();
    await withTxRetry(this.prisma, async (tx) => {
      await tx.dataAccessLog.createMany({
        data: log.map((l) => ({
          request_id: id,
          admin_id: admin.id,
          entity_type: l.entity_type,
          entity_id: l.entity_id,
          accessed_at: preparedAt,
        })),
      });
      if (request.status === 'received') {
        await tx.dataAccessRequest.update({
          where: { id },
          data: { status: 'in_progress' },
        });
      }
      await this.audit.record(
        {
          adminId: admin.id,
          action: DATA_REQUEST_AUDIT.package,
          targetType: 'data_access_request',
          targetId: id,
          after: { userId: user.id, sections, entities: log.length },
          ip: admin.ip,
          justification: admin.justification,
        },
        tx,
      );
    });
    return {
      requestId: id,
      referenceNumber: request.reference_number,
      preparedAt: preparedAt.toISOString(),
      sections,
      data,
      loggedEntities: log.length,
    };
  }
}

function present(r: Row): DataRequestDto {
  return {
    id: r.id,
    requestType: r.request_type,
    referenceNumber: r.reference_number,
    agency: r.agency,
    receivedAt: r.received_at.toISOString(),
    scope: r.scope,
    status: r.status,
    handledBy: r.handled_by,
    notes: r.notes,
    closedAt: r.closed_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
    accessCount: r._count.access_log,
  };
}

const notFound = () =>
  new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Data request not found.',
  });
