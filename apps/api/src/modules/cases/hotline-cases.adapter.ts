import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  caseDescriptionOf,
  caseTitleOf,
  type HotlineCaseOffer,
  type HotlineCasesPort,
} from '../../common/hotline/hotline-cases.port';
import { BudgetMode } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { FilesService } from '../files/files.service';
import { LegalAcceptanceService } from '../legal-documents/legal-acceptance.service';
import { CaseInvitesService } from './case-invites/case-invites.service';
import { CasesService } from './cases.service';

/**
 * Owner row 87 (hotline plan PR 7): the cases family's side of the hotline
 * port (common/hotline/hotline-cases.port.ts) — «Предложить дело» makes our
 * ordinary case and invite, and the hotline screens get a person's photo.
 * Provided under HOTLINE_CASES_PORT by CasesModule; the hotline module
 * never imports the cases module.
 */
@Injectable()
export class HotlineCasesAdapter implements HotlineCasesPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cases: CasesService,
    private readonly invites: CaseInvitesService,
    private readonly files: FilesService,
    private readonly acceptance: LegalAcceptanceService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(HotlineCasesAdapter.name);
  }

  async avatarUrl(fileId: string | null | undefined): Promise<string | null> {
    if (!fileId) return null;
    try {
      const got = (await this.files.avatarUrlsMany([fileId])).get(fileId);
      return got?.url256 ?? got?.url ?? null;
    } catch (err) {
      this.logger.debug(
        { err: err instanceof Error ? err.message : err },
        'hotline: no avatar',
      );
      return null;
    }
  }

  /** Plan PR 7 (owner 18.11 mockup c11b / a8): the ordinary case of the
   * public cases API (the client's checks, limits, contact filter) built
   * from the call — title and description from «О чём звонок», the
   * request's practice and state, budget «уточню позже» unless the client
   * named one — and our ordinary invite to the attorney of the call, who
   * answers with our bid form. */
  async offerCase(
    i: HotlineCaseOffer,
  ): Promise<{ caseId: string; inviteId: string }> {
    // the same «accept the current documents» as POST /cases
    // (RequireLegalAcceptance); a client is never an assistant
    await this.acceptance.assertAccepted(i.client.sub);
    const client = i.client as RequestUser;
    const area = await this.prisma.practiceArea.findFirst({
      where: { code: i.practiceArea, is_active: true },
      select: {
        id: true,
        name_en: true,
        parent_id: true,
        children: {
          where: { is_active: true },
          orderBy: [{ sort: 'asc' }, { code: 'asc' }],
          select: { id: true },
          take: 1,
        },
      },
    });
    const leafId = area?.parent_id ? area.id : area?.children[0]?.id;
    if (!area || !leafId) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'The practice area of the call is gone.',
      });
    }
    const topic = i.topic.trim();
    const title = caseTitleOf(topic, area.name_en);
    const kase = await this.cases.create(
      client,
      {
        practiceAreaId: leafId,
        title,
        description: caseDescriptionOf(topic, area.name_en, i.state),
        primaryStateCode: i.state,
        budgetMode:
          i.budgetAmountDollars !== undefined
            ? BudgetMode.amount
            : BudgetMode.clarify_later,
        ...(i.budgetAmountDollars !== undefined
          ? { budgetAmountDollars: i.budgetAmountDollars }
          : {}),
        ...(i.clientContactSharingConsent
          ? { clientContactSharingConsent: true }
          : {}),
      },
      i.meta,
    );
    const invite = await this.invites.create(client, kase.id, {
      attorneyId: i.attorneyId,
      ...(i.message ? { message: i.message } : {}),
      ...(i.budgetAmountDollars !== undefined
        ? { budgetCents: i.budgetAmountDollars * 100 }
        : {}),
    });
    return { caseId: kase.id, inviteId: invite.id };
  }
}
