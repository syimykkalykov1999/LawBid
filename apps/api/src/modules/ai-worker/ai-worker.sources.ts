import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import {
  AutoBarLookupProvider,
  stateBarLookupUrl,
} from '../verification/verification.public';
import type { ItemData } from './ai-worker.prompt';

/**
 * Owner 2026-11-12 (rows 50, 51) «ИИ-сотрудник»: the READ-ONLY sources of the
 * newer queues, kept apart from ai-worker.queues.ts because they read the
 * support thread and the reported object (the queues file may not).
 *
 *  - Bar registries (row 50): the server itself asks the state's official
 *    registry through the platform's own AutoBarLookupProvider →
 *    StateRegistryService (the free sources of state-presets.ts, the keyed
 *    adapters, the paid vendors the owner switched on) with their per-state
 *    rate limit, 24 h cache and circuit breaker (RegistryGuard). No new
 *    scraper, no other site; a state with no automatic source is never
 *    "worked around": the item goes to the owner with the registry link.
 *  - Support tickets and moderation complaints (row 51).
 *
 * Nothing here writes; private chats are never read: a reported chat
 * message is passed without its text (ai-worker.guard.spec.ts checks it).
 */

const DAY_MS = 86_400_000;
const THREAD_MESSAGES = 20;
const SAME_TARGET_READ = 200;

export interface RegistryLicence {
  state_code: string;
  bar_number: string;
}

export interface RegistryLink {
  stateCode: string;
  url: string;
}

/** What the server learnt from the registries, ready for ItemData. */
export interface RegistryFacts {
  facts: string[];
  data: Record<string, string>;
  flags: string[];
  /** Owner 2026-11-12: «Проверить вручную» links of the states with no
   * automatic source (shown to the owner, never sent to the model). */
  links: RegistryLink[];
  /** A lookup hit the per-state rate limit: the item waits for the next
   * tick instead of going to the model without the registry's answer. */
  retryLater: boolean;
}

/** RegistryGuard's «too many lookups a minute» (registry-guard.ts). */
const RATE_LIMITED = /lookups a minute/;

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;
const day = (d: Date) => d.toISOString().slice(0, 10);

/** The registry links of the states with no automatic source. */
export function manualRegistryLinks(
  licences: readonly RegistryLicence[],
  manualStates: ReadonlySet<string>,
): RegistryLink[] {
  const out: RegistryLink[] = [];
  for (const l of licences) {
    if (!manualStates.has(l.state_code)) continue;
    const url = stateBarLookupUrl(l.state_code, l.bar_number);
    if (url) out.push({ stateCode: l.state_code, url });
  }
  return out;
}

@Injectable()
export class AiWorkerSources {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly bar?: AutoBarLookupProvider,
    @Optional() private readonly moderation?: ModerationService,
  ) {}

  // ------------------------------------------------------------ registries

  /**
   * Row 50: one lookup per licence through the platform's registry layer.
   * The verdict (found / name match / active / expiry) is the platform's
   * own (registry-http.ts outcomeFor), so it is a fact; the registry's raw
   * texts (name, status word, firm) are untrusted data.
   */
  async registry(
    licences: readonly RegistryLicence[],
    name: { first: string; last: string },
    now: Date,
  ): Promise<RegistryFacts> {
    const out: RegistryFacts = {
      facts: [],
      data: {},
      flags: [],
      links: [],
      retryLater: false,
    };
    const manual = new Set<string>();
    for (const [i, l] of licences.entries()) {
      const n = i + 1;
      const st = l.state_code;
      const auto = this.bar
        ? await this.bar.supports(st).catch(() => false)
        : false;
      if (!auto) {
        manual.add(st);
        out.facts.push(
          `registry check licence ${n} (state ${st}): no automatic official source for this state; the owner checks the state registry by hand`,
        );
        out.flags.push(`licence_${st}_registry_manual`);
        continue;
      }
      const res = await this.bar!.lookup({
        stateCode: st,
        barNumber: l.bar_number,
        firstName: name.first,
        lastName: name.last,
      });
      const d = res.details;
      const reason = str(d.reason);
      if (
        res.result === 'manual_review' &&
        reason === 'provider_error' &&
        RATE_LIMITED.test(str(d.error) ?? '')
      ) {
        out.retryLater = true;
        return out;
      }
      if (res.result === 'manual_review' && reason !== 'name_mismatch') {
        // Registry down, breaker open, master switch off.
        manual.add(st);
        out.facts.push(
          `registry check licence ${n} (state ${st}): the official source did not answer now (${reason ?? 'no answer'}); the owner checks by hand`,
        );
        out.flags.push(`licence_${st}_registry_unavailable`);
        continue;
      }
      const found = d.found === true;
      const active = d.licenseStatus === 'active';
      const nameMatch = res.result === 'pass';
      const expires = str(d.registryExpiresAt);
      const expired = !!expires && new Date(expires).getTime() < now.getTime();
      out.facts.push(
        `registry check licence ${n} (state ${st}, official source ${str(d.provider) ?? 'registry'}${d.cachedAt ? ', answer from the 24 h cache' : ''}): found ${found ? 'yes' : 'no'}; ${
          found
            ? `status ${active ? 'active' : 'NOT active'}; name match ${nameMatch ? 'yes' : 'no'}; registry expiry ${expires ?? 'not published'}${expired ? ' (EXPIRED)' : ''}`
            : 'bar number not in the registry'
        }; platform verdict ${res.result}`,
      );
      if (!found) out.flags.push(`licence_${st}_registry_not_found`);
      else if (!active) out.flags.push(`licence_${st}_registry_not_active`);
      else if (!nameMatch)
        out.flags.push(`licence_${st}_registry_name_mismatch`);
      if (expired) out.flags.push(`licence_${st}_registry_expired`);
      for (const [k, v] of [
        ['name', d.name],
        ['status_word', d.registryStatus],
        ['firm', d.firm],
        ['admitted', d.admittedAt],
      ] as const) {
        const s = str(v);
        if (s) out.data[`licence_${n}_registry_${k}`] = s;
      }
    }
    out.links = manualRegistryLinks(licences, manual);
    return out;
  }

  // --------------------------------------------------------------- support

  /** «Ждёт ответа»: the ball is on our side. */
  private static readonly SUPPORT_OPEN = 'open';

  async supportOpenIds(take: number, afterId?: string): Promise<string[]> {
    const rows = await this.prisma.supportTicket.findMany({
      where: { status: AiWorkerSources.SUPPORT_OPEN },
      orderBy: { id: 'asc' },
      take,
      ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  supportOpenCount(): Promise<number> {
    return this.prisma.supportTicket.count({
      where: { status: AiWorkerSources.SUPPORT_OPEN },
    });
  }

  async supportExamples(n: number, now: Date) {
    const rows = await this.prisma.supportTicket.findMany({
      where: { status: AiWorkerSources.SUPPORT_OPEN },
      orderBy: { last_message_at: 'asc' },
      take: n,
      select: {
        id: true,
        category: true,
        priority: true,
        last_message_at: true,
      },
    });
    return rows.map((r) => ({
      itemId: r.id,
      summary: `ждёт ${Math.floor((now.getTime() - r.last_message_at.getTime()) / DAY_MS)} дн.; тема: ${r.category}; срочность: ${r.priority}`,
    }));
  }

  async supportStillOpen(id: string): Promise<boolean> {
    const t = await this.prisma.supportTicket.findUnique({
      where: { id },
      select: { status: true },
    });
    return t?.status === AiWorkerSources.SUPPORT_OPEN;
  }

  async support(id: string, now: Date): Promise<ItemData | null> {
    const t = await this.prisma.supportTicket.findUnique({
      where: { id },
      select: {
        user_id: true,
        subject: true,
        category: true,
        status: true,
        priority: true,
        created_at: true,
        last_message_at: true,
        sla_due_at: true,
        sla_breached_at: true,
        country_code: true,
      },
    });
    if (!t) return null;
    const [user, newest] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: t.user_id },
        select: { role: true, ui_language: true },
      }),
      // Public messages only: internal staff notes are not the AI's.
      this.prisma.supportMessage.findMany({
        where: { ticket_id: id, internal: false },
        orderBy: { created_at: 'desc' },
        take: THREAD_MESSAGES,
        select: {
          author_user_id: true,
          auto: true,
          body: true,
          created_at: true,
        },
      }),
    ]);
    const thread = [...newest].reverse();
    const last = thread[thread.length - 1];
    const who = (m: (typeof thread)[number]) =>
      m.author_user_id ? 'user' : m.auto ? 'auto' : 'team';
    const facts = [
      `queue: support ticket waiting for the team's answer`,
      `today: ${day(now)}`,
      `category: ${t.category}; priority: ${t.priority}; status: ${t.status}`,
      `opened: ${day(t.created_at)}; last message: ${day(t.last_message_at)} from ${last ? who(last) : 'nobody'}`,
      `the user is: ${String(user?.role ?? 'unknown')}; the user's app language: ${user?.ui_language ?? 'en'}; country: ${t.country_code}`,
      `answer due: ${t.sla_due_at ? day(t.sla_due_at) : 'none'}${t.sla_breached_at ? ' (already late)' : ''}`,
      `messages shown: ${thread.length} newest public ones, oldest first`,
    ];
    const data: Record<string, string> = { subject: t.subject };
    thread.forEach((m, i) => {
      data[`message_${i + 1}_${who(m)}`] = m.body;
    });
    const flags: string[] = [];
    // Money and abuse never go out without the owner (big platforms keep
    // refunds, disputes and safety reports with a human).
    if (t.category === 'billing') flags.push('category_billing');
    if (t.category === 'abuse') flags.push('category_abuse');
    if (t.priority === 'urgent') flags.push('priority_urgent');
    if (!last || who(last) !== 'user') flags.push('last_message_not_from_user');
    return { facts, data, flags };
  }

  // ------------------------------------------------------------ complaints

  async complaintOpenIds(take: number, afterId?: string): Promise<string[]> {
    const rows = await this.prisma.report.findMany({
      where: { status: 'open' },
      orderBy: { id: 'asc' },
      take,
      ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  complaintOpenCount(): Promise<number> {
    return this.prisma.report.count({ where: { status: 'open' } });
  }

  async complaintExamples(n: number, now: Date) {
    const rows = await this.prisma.report.findMany({
      where: { status: 'open' },
      orderBy: { created_at: 'asc' },
      take: n,
      select: { id: true, target_type: true, reason: true, created_at: true },
    });
    return rows.map((r) => ({
      itemId: r.id,
      summary: `ждёт ${Math.floor((now.getTime() - r.created_at.getTime()) / DAY_MS)} дн.; на: ${String(r.target_type)}; причина: ${String(r.reason)}`,
    }));
  }

  /** The admin moderation card of each report (its object's page). */
  async complaintPaths(ids: readonly string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.report.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, target_type: true, target_id: true },
    });
    return new Map(
      rows.map((r) => [
        r.id,
        `/moderation/${String(r.target_type)}/${r.target_id}`,
      ]),
    );
  }

  async complaintStillOpen(id: string): Promise<boolean> {
    const r = await this.prisma.report.findUnique({
      where: { id },
      select: { status: true },
    });
    return r?.status === 'open';
  }

  async complaint(id: string, now: Date): Promise<ItemData | null> {
    const r = await this.prisma.report.findUnique({
      where: { id },
      select: {
        reporter_id: true,
        target_type: true,
        target_id: true,
        reason: true,
        note: true,
        priority_review: true,
        created_at: true,
      },
    });
    if (!r) return null;
    const type = r.target_type;
    // A chat message is private: its text is never given to the AI.
    const target =
      type === 'message' || !this.moderation
        ? null
        : await this.moderation.resolve(type, r.target_id).catch(() => null);
    const [same, standing, sanctions] = await Promise.all([
      this.prisma.report.findMany({
        where: { target_type: type, target_id: r.target_id, status: 'open' },
        take: SAME_TARGET_READ,
        select: { reporter_id: true, reason: true },
      }),
      this.prisma.reporterStanding.findUnique({
        where: { user_id: r.reporter_id },
        select: { warnings: true, suspensions: true },
      }),
      target?.authorId
        ? this.prisma.moderationAction.count({
            where: { target_type: 'user', target_id: target.authorId },
          })
        : Promise.resolve(0),
    ]);
    const reasons = [...new Set(same.map((s) => String(s.reason)))];
    const facts = [
      `queue: user complaint (report) on a ${String(type)}`,
      `today: ${day(now)}; reported: ${day(r.created_at)}`,
      `reason chosen by the reporter: ${String(r.reason)}`,
      `open reports on the same object: ${same.length}${same.length >= SAME_TARGET_READ ? '+' : ''} from ${new Set(same.map((s) => s.reporter_id)).size} different people; reasons: ${reasons.join(', ')}`,
      `reporter's record of false reports: ${standing?.warnings ?? 0} warnings, ${standing?.suspensions ?? 0} suspensions`,
      `reported object: ${
        type === 'message'
          ? 'a private chat message (text not shown to the AI)'
          : target
            ? `status ${target.status}${target.createdAt ? `, created ${day(target.createdAt)}` : ''}`
            : 'not found (deleted)'
      }`,
      `earlier sanctions of the object's author: ${sanctions}`,
      `verified attorney's content (a human must look first): ${r.priority_review ? 'yes' : 'no'}`,
    ];
    const data: Record<string, string> = { reporter_note: r.note ?? '' };
    if (target?.text) data.reported_text = target.text;
    const flags: string[] = [];
    if (r.priority_review) flags.push('priority_review');
    if (!target && type !== 'message') flags.push('target_missing');
    if (type === 'message') flags.push('private_message_text_hidden');
    return { facts, data, flags };
  }
}
