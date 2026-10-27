import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { cleanText, hashRef } from './staff-ai-pii';
import type { AiItemKind } from './staff-ai.types';

/** One case as the reviewer saw it, already scrubbed, plus the decision. */
export interface DecisionContext {
  /** Facts the reviewer saw. */
  facts: string;
  /** What the staff member decided / the state they left. */
  decision: string;
}

const MAX_FACTS_CHARS = 6000;
const MAX_MESSAGES = 30;

/**
 * Staff package T12: builds the text that goes to the model for one case.
 *
 * PII rules (plan D, «в ИИ не уходят паспорт/телефон/e-mail»):
 *  - only fields a reviewer reads to decide are selected (never names,
 *    e-mails, phones, user or admin ids, IPs, documents or file links);
 *  - private user-to-user chats, case files and identity documents are never
 *    loaded: a report on a chat message is judged from its reason and note;
 *  - every free text goes through `cleanText` (cut + scrubPii), and the
 *    client scrubs the whole prompt once more;
 *  - the case id is replaced by a short hash.
 * A kind without a loader here is simply not reviewed (returns null).
 */
@Injectable()
export class StaffAiContextService {
  constructor(private readonly prisma: PrismaService) {}

  async load(
    kind: AiItemKind,
    itemId: string,
  ): Promise<DecisionContext | null> {
    switch (kind) {
      case 'support_ticket':
        return this.supportTicket(itemId);
      case 'report':
        return this.report(itemId);
      case 'verification':
        return this.verification(itemId);
    }
  }

  /** The user message: facts (and, for the review, the decision). */
  static prompt(
    itemId: string,
    ctx: DecisionContext,
    withDecision: boolean,
  ): string {
    const head = `<case ref="${hashRef(itemId)}">\n${ctx.facts}\n</case>`;
    return withDecision
      ? `${head}\n<decision>\n${ctx.decision}\n</decision>`
      : head;
  }

  private async supportTicket(id: string): Promise<DecisionContext | null> {
    const t = await this.prisma.supportTicket.findUnique({
      where: { id },
      select: {
        subject: true,
        category: true,
        priority: true,
        status: true,
        resolved_by: true,
        first_response_by: true,
      },
    });
    if (!t) return null;
    const msgs = await this.prisma.supportMessage.findMany({
      where: { ticket_id: id },
      orderBy: { created_at: 'asc' },
      take: MAX_MESSAGES,
      select: {
        body: true,
        internal: true,
        auto: true,
        author_admin_id: true,
      },
    });
    const lines = msgs.map((m) => {
      const who = m.auto
        ? 'auto'
        : m.author_admin_id
          ? m.internal
            ? 'staff-note'
            : 'staff'
          : 'client';
      return `${who}: ${cleanText(m.body, 600)}`;
    });
    const facts = [
      `queue: support ticket; category: ${t.category}; priority: ${t.priority}`,
      `subject: ${cleanText(t.subject, 200)}`,
      ...lines,
    ]
      .join('\n')
      .slice(0, MAX_FACTS_CHARS);
    const staffReplies = msgs.filter(
      (m) => m.author_admin_id && !m.internal,
    ).length;
    return {
      facts,
      decision: `final status: ${t.status}; public replies by staff: ${staffReplies}; closed by staff: ${t.resolved_by ? 'yes' : 'no'}`,
    };
  }

  private async report(id: string): Promise<DecisionContext | null> {
    const r = await this.prisma.report.findUnique({
      where: { id },
      select: {
        target_type: true,
        reason: true,
        note: true,
        status: true,
        priority_review: true,
      },
    });
    if (!r) return null;
    const actions = await this.prisma.moderationAction.findMany({
      where: { report_id: id },
      orderBy: { created_at: 'asc' },
      take: 5,
      select: { action: true, reason: true },
    });
    const facts = [
      `queue: user report; reported object: ${String(r.target_type)}; reason: ${String(r.reason)}${r.priority_review ? '; flagged for priority review' : ''}`,
      `reporter note: ${cleanText(r.note, 600) || '(none)'}`,
    ].join('\n');
    const acts = actions.length
      ? actions
          .map(
            (a) =>
              `${String(a.action)}${a.reason ? ` (${cleanText(a.reason, 200)})` : ''}`,
          )
          .join('; ')
      : 'none';
    return {
      facts,
      decision: `final status: ${String(r.status)}; moderation actions: ${acts}`,
    };
  }

  private async verification(id: string): Promise<DecisionContext | null> {
    const v = await this.prisma.verificationRequest.findUnique({
      where: { id },
      select: {
        status: true,
        provider: true,
        applicant_comment: true,
        rejection_code: true,
        rejection_reason: true,
        admin_note: true,
        info_request_message: true,
        checks: { select: { check_type: true, result: true }, take: 20 },
      },
    });
    if (!v) return null;
    const checks = v.checks.length
      ? v.checks
          .map((c) => `${String(c.check_type)}=${String(c.result)}`)
          .join(', ')
      : 'none';
    const facts = [
      `queue: attorney verification; provider: ${String(v.provider)}`,
      `automatic checks: ${checks}`,
      `applicant comment: ${cleanText(v.applicant_comment, 500) || '(none)'}`,
    ].join('\n');
    return {
      facts,
      decision: [
        `final status: ${String(v.status)}`,
        v.rejection_code ? `rejection code: ${v.rejection_code}` : '',
        v.rejection_reason
          ? `rejection reason: ${cleanText(v.rejection_reason, 300)}`
          : '',
        v.admin_note ? `reviewer note: ${cleanText(v.admin_note, 300)}` : '',
        v.info_request_message
          ? `information requested: ${cleanText(v.info_request_message, 300)}`
          : '',
      ]
        .filter(Boolean)
        .join('; '),
    };
  }
}
