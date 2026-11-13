import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { StaffAiModel } from '../staff-ai/staff-ai.types';
import type { ItemData } from './ai-worker.prompt';

/**
 * Owner 2026-11-12 «ИИ-сотрудник»: the admin queues a role may work on and
 * their READ-ONLY loaders. This file is the whole tool allowlist of the AI
 * worker: the server (never the model) picks the queue's loader, reads the
 * item and hands it over as data. Nothing here writes, and nothing reads
 * secrets, money or private chats (ai-worker.guard.spec.ts checks it).
 */
export const AI_WORKER_QUEUES = ['attorney_verification'] as const;
export type AiWorkerQueue = (typeof AI_WORKER_QUEUES)[number];
export const isAiWorkerQueue = (q: string): q is AiWorkerQueue =>
  (AI_WORKER_QUEUES as readonly string[]).includes(q);

export const QUEUE_LABEL: Readonly<Record<AiWorkerQueue, string>> = {
  attorney_verification: 'Проверка документов адвокатов',
};

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
  constructor(private readonly prisma: PrismaService) {}

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
    }
  }

  async openCount(queue: AiWorkerQueue): Promise<number> {
    switch (queue) {
      case 'attorney_verification':
        return this.prisma.verificationRequest.count({
          where: { status: { in: [...OPEN_VERIFICATION] } },
        });
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
    }
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
    return { facts, data, flags: verificationFlags(v, docTypes, hasId, now) };
  }
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
