import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { SaveConsentsDto } from '../dto/consents.dto';
import type { RequestMeta } from '../../auth/services/session.service';

/**
 * POST /users/me/consents (docs/01_FOUNDATION_AUTH.md §10.2 step H).
 * user_consents is append-only (docs/02_DATABASE.md §6.2) — each call
 * inserts new rows rather than updating; "current" consent state is the
 * latest row per (user_id, consent_type), same convention the schema's
 * index (user_id, consent_type, created_at DESC) is shaped for.
 *
 * device_id is left null here: the spec's §10.5 request body for this
 * endpoint is `{consents: [...]}` only, with no device envelope (unlike
 * the auth endpoints, which all take an explicit deviceInfo object) —
 * inventing an undocumented field wasn't warranted (.cursorrules: don't
 * add "заодно"). ip is still captured since it's ambient on every request
 * regardless of body shape.
 */
@Injectable()
export class ConsentsService {
  constructor(private readonly prisma: PrismaService) {}

  async save(
    userId: string,
    dto: SaveConsentsDto,
    meta: RequestMeta,
  ): Promise<void> {
    await this.prisma.userConsent.createMany({
      data: dto.consents.map((c) => ({
        user_id: userId,
        consent_type: c.type,
        document_id: c.documentId,
        granted: c.granted,
        ip: meta.ip,
      })),
    });
  }
}
