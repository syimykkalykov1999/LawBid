import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { covers, parsePermissions } from '../admin-auth/admin-permissions';
import type { AdminRoleTemplateDto } from './admin.dto';

const AUDIT = {
  create: 'admins.template_create',
  update: 'admins.template_update',
  remove: 'admins.template_delete',
} as const;

/**
 * Named sets of admin rights ("Verifier", "Support", ...). A template is
 * only a starting point: choosing it fills the toggles, which the creator can
 * still change; the real check stays in AdminsService (nobody grants more
 * than they hold). Here too, a manager can only save or touch a template
 * that fits inside their own rights.
 */
@Injectable()
export class AdminRoleTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async list(): Promise<AdminRoleTemplateDto[]> {
    const rows = await this.prisma.adminRoleTemplate.findMany({
      orderBy: { name: 'asc' },
    });
    return rows.map(present);
  }

  async create(
    actor: AdminActor,
    name: string,
    input: Record<string, string>,
  ): Promise<AdminRoleTemplateDto> {
    const permissions = parsePermissions(input);
    this.assertFits(actor, permissions);
    const clean = cleanName(name);
    const taken = await this.prisma.adminRoleTemplate.findUnique({
      where: { name: clean },
    });
    if (taken) throw nameTaken();
    const row = await this.prisma.adminRoleTemplate.create({
      data: { name: clean, permissions, created_by: actor.id },
    });
    await this.audit.record({
      adminId: actor.id,
      action: AUDIT.create,
      targetType: 'admin_template',
      targetId: row.id,
      after: { name: clean, permissions },
      ip: actor.ip,
    });
    return present(row);
  }

  async update(
    actor: AdminActor,
    id: string,
    name: string,
    input: Record<string, string>,
  ): Promise<AdminRoleTemplateDto> {
    const before = await this.load(id);
    this.assertFits(actor, parsePermissions(before.permissions));
    const permissions = parsePermissions(input);
    this.assertFits(actor, permissions);
    const clean = cleanName(name);
    if (clean !== before.name) {
      const taken = await this.prisma.adminRoleTemplate.findUnique({
        where: { name: clean },
      });
      if (taken) throw nameTaken();
    }
    const row = await this.prisma.adminRoleTemplate.update({
      where: { id },
      data: { name: clean, permissions },
    });
    await this.audit.record({
      adminId: actor.id,
      action: AUDIT.update,
      targetType: 'admin_template',
      targetId: id,
      before: { name: before.name, permissions: before.permissions ?? {} },
      after: { name: clean, permissions },
      ip: actor.ip,
    });
    return present(row);
  }

  async remove(actor: AdminActor, id: string): Promise<void> {
    const before = await this.load(id);
    this.assertFits(actor, parsePermissions(before.permissions));
    await this.prisma.adminRoleTemplate.delete({ where: { id } });
    await this.audit.record({
      adminId: actor.id,
      action: AUDIT.remove,
      targetType: 'admin_template',
      targetId: id,
      before: { name: before.name, permissions: before.permissions ?? {} },
      ip: actor.ip,
    });
  }

  private assertFits(
    actor: AdminActor,
    permissions: ReturnType<typeof parsePermissions>,
  ): void {
    if (actor.adminRole === 'super_admin') return;
    if (!covers(actor.permissions ?? {}, permissions)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'A template cannot give more than you have yourself.',
      });
    }
  }

  private async load(id: string) {
    const row = await this.prisma.adminRoleTemplate.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Template not found.',
      });
    }
    return row;
  }
}

function cleanName(name: string): string {
  const n = name.trim().replace(/\s+/g, ' ');
  if (n.length < 2) {
    throw new ConflictException({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'The template name is too short.',
    });
  }
  return n;
}

function nameTaken(): ConflictException {
  return new ConflictException({
    code: ErrorCode.VALIDATION_ERROR,
    message: 'A template with this name already exists.',
  });
}

function present(r: {
  id: string;
  name: string;
  permissions: unknown;
  updated_at: Date;
}): AdminRoleTemplateDto {
  return {
    id: r.id,
    name: r.name,
    permissions: parsePermissions(r.permissions),
    updatedAt: r.updated_at.toISOString(),
  };
}
