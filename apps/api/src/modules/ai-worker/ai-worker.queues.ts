import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { StaffAiModel } from '../staff-ai/staff-ai.types';
import { stateBarLookupUrl } from '../verification/verification.public';
import type { ItemData } from './ai-worker.prompt';
import { AiWorkerSources } from './ai-worker.sources';

/**
 * Owner 2026-11-12 «ИИ-сотрудник»: the admin queues a role may work on and
 * their READ-ONLY loaders. This file is the whole tool allowlist of the AI
 * worker: the server (never the model) picks the queue's loader, reads the
 * item and hands it over as data. Nothing here writes, and nothing reads
 * secrets, money or private chats (ai-worker.guard.spec.ts checks it).
 */
export const AI_WORKER_QUEUES = [
  'attorney_verification',
  // Owner 2026-11-12 (row 51): support replies and complaint triage.
  'support_reply',
  'complaint_triage',
] as const;
export type AiWorkerQueue = (typeof AI_WORKER_QUEUES)[number];
export const isAiWorkerQueue = (q: string): q is AiWorkerQueue =>
  (AI_WORKER_QUEUES as readonly string[]).includes(q);

export const QUEUE_LABEL: Readonly<Record<AiWorkerQueue, string>> = {
  attorney_verification: 'Проверка документов адвокатов',
  support_reply: 'Ответы в поддержку',
  complaint_triage: 'Разбор жалоб',
};

/** Owner 2026-11-12 (row 51): the queue whose approved proposals are sent
 * (a support reply); every other queue's approval only records. */
export const SENDS_REPLY: ReadonlySet<AiWorkerQueue> = new Set([
  'support_reply',
]);

/**
 * Owner 2026-11-12 (row 55): a new role's model follows its queue (the role's
 * model field stays the owner's to change). Important or complex checks
 * (documents, identity, licences; the future face / bar results review) get
 * Opus 5.5; simple queues (the future support reply drafts, simple complaint
 * triage) get Haiku 5.5. A new queue must be added here (the type demands it).
 */
export const QUEUE_DEFAULT_MODEL: Readonly<
  Record<AiWorkerQueue, StaffAiModel>
> = {
  attorney_verification: 'claude-opus-5-5',
  support_reply: 'claude-haiku-5-5',
  complaint_triage: 'claude-haiku-5-5',
};

/** Verification requests a human still has to decide. */
const OPEN_VERIFICATION = ['submitted', 'in_review'] as const;
const DAY_MS = 86_400_000;

export interface QueueExample {
  itemId: string;
  summary: string;
}

/** «Лицензия, штат, срок, совпадение имени»: what the reviewer sees. */
@Injectable()
export class AiWorkerQueues {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sources: AiWorkerSources,
  ) {}

  /** Ids of open items, oldest first, keyset after [afterId]. */
  async openIds(
    queue: AiWorkerQueue,
    take: number,
    afterId?: string,
  ): Promise<string[]> {
    switch (queue) {
      case 'attorney_verification': {
        const rows = await this.prisma.verificationRequest.findMany({
          where: { status: { in: [...OPEN_VERIFICATION] } },
          orderBy: { id: 'asc' },
          take,
          ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
          select: { id: true },
        });
        return rows.map((r) => r.id);
      }
      case 'support_reply':
        return this.sources.supportOpenIds(take, afterId);
      case 'complaint_triage':
        return this.sources.complaintOpenIds(take, afterId);
    }
  }

  async openCount(queue: AiWorkerQueue): Promise<number> {
    switch (queue) {
      case 'attorney_verification':
        return this.prisma.verificationRequest.count({
          where: { status: { in: [...OPEN_VERIFICATION] } },
        });
      case 'support_reply':
        return this.sources.supportOpenCount();
      case 'complaint_triage':
        return this.sources.complaintOpenCount();
    }
  }

  /** Short, name-free lines for «вот 3 примера». */
  async examples(
    queue: AiWorkerQueue,
    n: number,
    now: Date = new Date(),
  ): Promise<QueueExample[]> {
    switch (queue) {
      case 'attorney_verification': {
        const rows = await this.prisma.verificationRequest.findMany({
          where: { status: { in: [...OPEN_VERIFICATION] } },
          orderBy: { submitted_at: 'asc' },
          take: n,
          select: {
            id: true,
            submitted_at: true,
            documents: { select: { doc_type: true }, take: 20 },
            attorney: {
              select: {
                licenses: {
                  select: { state_code: true, license_status: true },
                  take: 5,
                },
              },
            },
          },
        });
        return rows.map((r) => {
          const days = r.submitted_at
            ? Math.floor((now.getTime() - r.submitted_at.getTime()) / DAY_MS)
            : 0;
          const docs = [...new Set(r.documents.map((d) => d.doc_type))];
          const lic = r.attorney.licenses
            .map((l) => `${l.state_code} ${l.license_status}`)
            .join(', ');
          return {
            itemId: r.id,
            summary: `ждёт ${days} дн.; документы: ${docs.join(', ') || 'нет'}; лицензия: ${lic || 'нет'}`,
          };
        });
      }
      case 'support_reply':
        return this.sources.supportExamples(n, now);
      case 'complaint_triage':
        return this.sources.complaintExamples(n, now);
    }
  }

  /** True while a human has not decided the item yet. */
  async stillOpen(queue: AiWorkerQueue, itemId: string): Promise<boolean> {
    switch (queue) {
      case 'attorney_verification': {
        const r = await this.prisma.verificationRequest.findUnique({
          where: { id: itemId },
          select: { status: true },
        });
        return (
          !!r && (OPEN_VERIFICATION as readonly string[]).includes(r.status)
        );
      }
      case 'support_reply':
        return this.sources.supportStillOpen(itemId);
      case 'complaint_triage':
        return this.sources.complaintStillOpen(itemId);
    }
  }

  /** The item as data for the model, or null when it is gone. */
  async load(
    queue: AiWorkerQueue,
    itemId: string,
    now: Date = new Date(),
  ): Promise<ItemData | null> {
    switch (queue) {
      case 'attorney_verification':
        return this.verification(itemId, now);
      case 'support_reply':
        return this.sources.support(itemId, now);
      case 'complaint_triage':
        return this.sources.complaint(itemId, now);
    }
  }

  /** The admin page of each item («Открыть»), by queue. */
  async openPaths(
    rows: ReadonlyArray<{ queue: string; itemId: string }>,
  ): Promise<Map<string, string>> {
    const complaints = await this.sources.complaintPaths(
      rows.filter((r) => r.queue === 'complaint_triage').map((r) => r.itemId),
    );
    const out = new Map<string, string>();
    for (const r of rows) {
      if (r.queue === 'support_reply')
        out.set(r.itemId, `/support/${r.itemId}`);
      else if (r.queue === 'complaint_triage') {
        const p = complaints.get(r.itemId);
        if (p) out.set(r.itemId, p);
      } else out.set(r.itemId, `/verification/${r.itemId}`);
    }
    return out;
  }

  /** Owner 2026-11-12 (row 50): the registry links of the states the
   * owner has to check by hand, for the review cards (never the model). */
  async registryLinks(
    requestIds: readonly string[],
  ): Promise<Map<string, Array<{ stateCode: string; url: string }>>> {
    const out = new Map<string, Array<{ stateCode: string; url: string }>>();
    if (requestIds.length === 0) return out;
    const rows = await this.prisma.verificationRequest.findMany({
      where: { id: { in: [...requestIds] } },
      select: {
        id: true,
        attorney: {
          select: {
            licenses: {
              select: { state_code: true, bar_number: true },
              take: 10,
            },
          },
        },
      },
    });
    for (const r of rows) {
      const links = r.attorney.licenses.flatMap((l) => {
        const url = stateBarLookupUrl(l.state_code, l.bar_number);
        return url ? [{ stateCode: l.state_code, url }] : [];
      });
      out.set(r.id, links);
    }
    return out;
  }

  private async verification(id: string, now: Date): Promise<ItemData | null> {
    const v = await this.prisma.verificationRequest.findUnique({
      where: { id },
      select: {
        status: true,
        provider: true,
        submitted_at: true,
        attested_at: true,
        applicant_comment: true,
        documents: {
          select: { doc_type: true, state_code: true, side: true },
          take: 30,
        },
        checks: {
          select: {
            check_type: true,
            provider: true,
            result: true,
            details: true,
            checked_at: true,
          },
          orderBy: { checked_at: 'desc' },
          take: 10,
        },
        attorney: {
          select: {
            verified_first_name: true,
            verified_last_name: true,
            name_mismatch: true,
            firm_name: true,
            user: { select: { first_name: true, last_name: true } },
            licenses: {
              select: {
                state_code: true,
                bar_number: true,
                license_status: true,
                expires_at: true,
                registry_flag: true,
                auto_check_result: true,
              },
              take: 10,
            },
          },
        },
      },
    });
    if (!v) return null;
    const a = v.attorney;
    const docTypes = [...new Set(v.documents.map((d) => d.doc_type))];
    const hasId = docTypes.some((t) =>
      ['drivers_license', 'passport', 'state_id'].includes(t),
    );
    const norm = (s: string | null | undefined) =>
      (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const profileName = `${norm(a.user.first_name)} ${norm(a.user.last_name)}`;
    const verifiedName = `${norm(a.verified_first_name)} ${norm(a.verified_last_name)}`;
    const facts: string[] = [
      `queue: attorney verification request`,
      `today: ${now.toISOString().slice(0, 10)}`,
      `request status: ${String(v.status)}; provider: ${String(v.provider)}`,
      `submitted: ${v.submitted_at?.toISOString().slice(0, 10) ?? 'not submitted'}`,
      `sworn self-attestation signed: ${v.attested_at ? 'yes' : 'no'}`,
      `documents present: ${docTypes.join(', ') || 'none'}`,
      `bar licence document present: ${docTypes.includes('bar_license') ? 'yes' : 'no'}`,
      `identity document present: ${hasId ? 'yes' : 'no'}`,
      `selfie present: ${docTypes.includes('selfie') ? 'yes' : 'no'}`,
      `platform name-mismatch flag: ${a.name_mismatch ? 'yes' : 'no'}`,
      `profile name equals verified name: ${
        verifiedName.trim()
          ? profileName === verifiedName
            ? 'yes'
            : 'no'
          : 'no verified name yet'
      }`,
      ...a.licenses.map((l, i) => {
        const exp = l.expires_at
          ? `${l.expires_at.toISOString().slice(0, 10)} (${
              l.expires_at.getTime() < now.getTime()
                ? 'EXPIRED'
                : `${Math.floor((l.expires_at.getTime() - now.getTime()) / DAY_MS)} days left`
            })`
          : 'unknown';
        return `licence ${i + 1}: state ${l.state_code}; status ${String(l.license_status)}; expires ${exp}; registry flag ${l.registry_flag ?? 'none'}`;
      }),
      ...v.checks.map(
        (c) =>
          `automatic check ${String(c.check_type)} (${String(c.provider)}): ${String(c.result)} on ${c.checked_at.toISOString().slice(0, 10)}`,
      ),
    ];
    // Everything below was typed by the applicant or came back from a
    // registry / provider: untrusted, passed only as quoted data.
    const data: Record<string, string> = {
      profile_name:
        `${a.user.first_name ?? ''} ${a.user.last_name ?? ''}`.trim(),
      verified_name:
        `${a.verified_first_name ?? ''} ${a.verified_last_name ?? ''}`.trim(),
      firm_name: a.firm_name ?? '',
      applicant_comment: v.applicant_comment ?? '',
    };
    a.licenses.forEach((l, i) => {
      data[`licence_${i + 1}_bar_number`] = l.bar_number;
      if (l.auto_check_result != null)
        data[`licence_${i + 1}_registry_answer`] = JSON.stringify(
          l.auto_check_result,
        );
    });
    v.checks.forEach((c, i) => {
      data[`check_${i + 1}_${String(c.check_type)}_details`] = JSON.stringify(
        c.details,
      );
    });
    // Owner 2026-11-12 (PR #961): the automatic face comparison (selfie vs
    // the ID photo), read from verification_checks when it is there.
    const face = v.checks.find((c) => String(c.check_type) === 'face_match');
    if (face) facts.push(faceMatchFact(face));
    // Owner 2026-11-12 (row 50): the server asks the official registries
    // itself and hands the answer over as platform facts.
    const first = a.verified_first_name || a.user.first_name || '';
    const last = a.verified_last_name || a.user.last_name || '';
    const reg = await this.sources.registry(a.licenses, { first, last }, now);
    if (reg.retryLater) return { facts, data, flags: [], retryLater: true };
    facts.push(...reg.facts);
    Object.assign(data, reg.data);
    const flags = [
      ...new Set([
        ...verificationFlags(v, docTypes, hasId, now),
        ...reg.flags,
        ...(face && String(face.result) === 'manual_review'
          ? ['face_match_needs_review']
          : []),
      ]),
    ];
    return { facts, data, flags };
  }
}

/** One line about the face comparison: result, similarity, reason (all
 * computed by the platform's provider, never typed by a user). */
export function faceMatchFact(c: {
  provider: unknown;
  result: unknown;
  details: unknown;
  checked_at: Date;
}): string {
  const d = (c.details ?? {}) as Record<string, unknown>;
  const sim =
    typeof d.similarity === 'number' ? `${d.similarity}%` : 'not measured';
  const reason =
    typeof d.reason === 'string' && /^[a-z_]{1,40}$/.test(d.reason)
      ? `; reason ${d.reason}`
      : '';
  return `face match (selfie vs the ID photo, ${String(c.provider)}): ${String(c.result)}; similarity ${sim}${reason}; on ${c.checked_at.toISOString().slice(0, 10)}`;
}

/** The platform's own red flags of a verification request (server facts,
 * never the model's): an «approve» against any of them goes to the owner. */
export function verificationFlags(
  v: {
    attested_at: Date | null;
    checks: Array<{ check_type: string; result: string }>;
    attorney: {
      name_mismatch: boolean;
      licenses: Array<{
        state_code: string;
        license_status: string;
        expires_at: Date | null;
        registry_flag: string | null;
      }>;
    };
  },
  docTypes: readonly string[],
  hasId: boolean,
  now: Date,
): string[] {
  const flags: string[] = [];
  if (!docTypes.includes('bar_license')) flags.push('no_bar_licence_document');
  if (!hasId) flags.push('no_identity_document');
  if (!v.attested_at) flags.push('not_attested');
  if (v.attorney.name_mismatch) flags.push('name_mismatch');
  if (v.attorney.licenses.length === 0) flags.push('no_licence');
  for (const l of v.attorney.licenses) {
    if (['rejected', 'expired', 'suspended'].includes(l.license_status))
      flags.push(`licence_${l.state_code}_${l.license_status}`);
    if (l.expires_at && l.expires_at.getTime() < now.getTime())
      flags.push(`licence_${l.state_code}_past_expiry`);
    if (l.registry_flag)
      flags.push(`licence_${l.state_code}_registry_${l.registry_flag}`);
  }
  for (const c of v.checks) {
    if (c.result === 'fail') flags.push(`check_${c.check_type}_failed`);
  }
  return [...new Set(flags)];
}
