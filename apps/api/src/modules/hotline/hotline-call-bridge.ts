import { Injectable, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import { CALL_SILENT_MS } from '../../common/calls/ongoing-call';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { BudgetMode } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { CallsService } from '../calls/calls.service';
import { ChatService } from '../chat/chat.service';
import { CaseInvitesService } from '../cases/case-invites/case-invites.service';
import { CasesService } from '../cases/cases.service';
import { FilesService } from '../files/files.service';

/** DI token of the bridge (tests pass a fake or nothing). */
export const HOTLINE_CALL_BRIDGE = Symbol('HOTLINE_CALL_BRIDGE');

export interface HotlineCallOpen {
  requestId: string;
  clientId: string;
  attorneyId: string;
  state: string;
  practiceArea: string;
  /** «Взять», ms — billing counts from here. */
  answeredAt: number;
  /** «О чём звонок» — kept for «Дело из звонка» (plan PR 7). */
  topic?: string;
}

/** «Предложить дело» (plan PR 7): the client's case from the call. */
export interface HotlineCaseOffer {
  client: RequestUser;
  attorneyId: string;
  /** The request's practice code (a category picks its first leaf). */
  practiceArea: string;
  state: string;
  topic: string;
  budgetAmountDollars?: number;
  message?: string;
  clientContactSharingConsent?: boolean;
  meta: { ip?: string; userAgent?: string; deviceId?: string };
}

/** What the 1:1 call machinery says about a hotline call now. */
export interface HotlineCallState {
  /** live = ringing / active; else the call's final status. */
  live: boolean;
  status: string;
  /** The last sign of life of the call screens (GET /calls/:id), ms. */
  heartbeatAt: number;
  durationSec: number | null;
  endReason: string | null;
}

export interface HotlineCallFinish {
  requestId: string;
  clientId: string;
  attorneyId: string;
  endedAt: number;
  reason: string;
  durationSec: number;
}

/**
 * Owner row 87 (plan PR 4): the hotline's ONLY door to the 1:1 calls. The
 * calls code is not changed (owner rule; `hotline-calls-untouched.spec.ts`
 * pins it): the bridge writes the call row the way a group call is written
 * (no chat), and everything after that is the public CallsService API —
 * `call:signal` relaying, `GET /calls/ice-servers` (Cloudflare TURN, policy
 * relay, exactly as for 1:1), `GET /calls/:id` heartbeats, `end` and the
 * calls sweep. Audio only, device to device (`p2p`): the voice never passes
 * a server of ours, so nothing can record it.
 */
export interface HotlineCallBridge {
  /** «Взять»: the real voice call between the two, answered now. */
  open(i: HotlineCallOpen): Promise<{ callId: string }>;
  /** The hotline ended it (red button, lost, time limit): the call too. */
  hangUp(
    callId: string,
    byUserId: string,
    reason: 'hangup' | 'failed',
  ): Promise<void>;
  /** The calls' own state, one read for many (the sweeper's sync). */
  states(callIds: string[]): Promise<Map<string, HotlineCallState>>;
  /** The billing row closed and the direct chat opened (or reused). */
  finish(i: HotlineCallFinish): Promise<{ conversationId: string | null }>;
  /** A person's photo for the hotline screens (null: none / hidden). */
  avatarUrl?(fileId: string | null | undefined): Promise<string | null>;
  /** «Предложить дело»: our ordinary case + its invite to this attorney. */
  offerCase?(
    i: HotlineCaseOffer,
  ): Promise<{ caseId: string; inviteId: string }>;
  /** In another live call (a 1:1 or group call, any of his devices) other
   * than [exceptCallId]: the line does not offer him a client meanwhile. */
  inOtherCall?(userId: string, exceptCallId?: string): Promise<boolean>;
}

const LIVE = new Set(['ringing', 'active']);

/** The case title (10–120 chars, cases DTO): the topic, made long enough
 * with the practice's name when it is a word or two («Развод»). */
export function caseTitleOf(topic: string, practice: string): string {
  const t = topic.trim();
  const title = t.length >= 10 ? t : `${t} — ${practice}`.trim();
  return (title.length >= 10 ? title : title.padEnd(10, '.')).slice(0, 120);
}

/** The case description (≥ 20 chars): the topic, the practice and state. */
export function caseDescriptionOf(
  topic: string,
  practice: string,
  state: string,
): string {
  const d = `${topic.trim()}\n\n${practice} · ${state}`;
  return d.length >= 20 ? d : d.padEnd(20, '.');
}

const as = (sub: string, role: 'client' | 'attorney'): RequestUser =>
  ({ sub, role }) as RequestUser;

@Injectable()
export class CallsHotlineBridge implements HotlineCallBridge {
  private callsSvc?: CallsService;
  private chatSvc?: ChatService;
  private filesSvc?: FilesService;
  private casesSvc?: CasesService;
  private invitesSvc?: CaseInvitesService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CallsHotlineBridge.name);
  }

  /** The app's own CallsService / ChatService instances, looked up once
   * (not imported as modules: the hotline module's graph, and with it the
   * route order of the API contract, stays as it was). */
  private get calls(): CallsService {
    this.callsSvc ??= this.moduleRef.get(CallsService, { strict: false });
    return this.callsSvc;
  }

  private get chat(): ChatService {
    this.chatSvc ??= this.moduleRef.get(ChatService, { strict: false });
    return this.chatSvc;
  }

  private get files(): FilesService {
    this.filesSvc ??= this.moduleRef.get(FilesService, { strict: false });
    return this.filesSvc;
  }

  private get cases(): CasesService {
    this.casesSvc ??= this.moduleRef.get(CasesService, { strict: false });
    return this.casesSvc;
  }

  private get invites(): CaseInvitesService {
    this.invitesSvc ??= this.moduleRef.get(CaseInvitesService, {
      strict: false,
    });
    return this.invitesSvc;
  }

  /** Scenarios 24.11 (Uber / Lyft: a driver on a trip gets no new ride;
   * WhatsApp: busy): the same «live call» rule as the calls module's own
   * busy check — a ringing or active 1:1 call, or a group call he is still
   * in — read here so the calls code stays untouched. A call silent for
   * CALL_SILENT_MS counts as over, as there. */
  async inOtherCall(userId: string, exceptCallId?: string): Promise<boolean> {
    const live = await this.prisma.call.findFirst({
      where: {
        status: { in: ['ringing', 'active'] },
        updated_at: { gte: new Date(Date.now() - CALL_SILENT_MS) },
        ...(exceptCallId ? { id: { not: exceptCallId } } : {}),
        OR: [
          {
            is_group: false,
            OR: [{ caller_id: userId }, { callee_id: userId }],
          },
          {
            is_group: true,
            participants: {
              some: { user_id: userId, status: { in: ['joined', 'invited'] } },
            },
          },
        ],
      },
      select: { id: true },
    });
    return live !== null;
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
      i.client,
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
    const invite = await this.invites.create(i.client, kase.id, {
      attorneyId: i.attorneyId,
      ...(i.message ? { message: i.message } : {}),
      ...(i.budgetAmountDollars !== undefined
        ? { budgetCents: i.budgetAmountDollars * 100 }
        : {}),
    });
    return { caseId: kase.id, inviteId: invite.id };
  }

  async open(i: HotlineCallOpen): Promise<{ callId: string }> {
    const prev = await this.prisma.hotlineCall.findUnique({
      where: { request_id: i.requestId },
      select: { call_id: true },
    });
    if (prev?.call_id) return { callId: prev.call_id };
    const answeredAt = new Date(i.answeredAt);
    // The client called the hotline, the attorney answered with «Взять»:
    // caller = client (his app starts WebRTC, as after `call:accepted`).
    const call = await this.prisma.call.create({
      data: {
        caller_id: i.clientId,
        callee_id: i.attorneyId,
        status: 'active',
        answered_at: answeredAt,
        video: false,
        media_provider: 'p2p',
      },
      select: { id: true },
    });
    await this.prisma.hotlineCall.upsert({
      where: { request_id: i.requestId },
      create: {
        request_id: i.requestId,
        call_id: call.id,
        client_id: i.clientId,
        attorney_id: i.attorneyId,
        state_code: i.state,
        practice_area: i.practiceArea,
        answered_at: answeredAt,
        ...(i.topic ? { topic: i.topic.slice(0, 200) } : {}),
      },
      update: { call_id: call.id },
    });
    return { callId: call.id };
  }

  async hangUp(
    callId: string,
    byUserId: string,
    reason: 'hangup' | 'failed',
  ): Promise<void> {
    try {
      await this.calls.end(as(byUserId, 'client'), callId, { reason });
    } catch (err) {
      // Already over or gone: nothing to hang up.
      this.logger.debug(
        { err: err instanceof Error ? err.message : err, callId },
        'hotline hang-up skipped',
      );
    }
  }

  async states(callIds: string[]): Promise<Map<string, HotlineCallState>> {
    const out = new Map<string, HotlineCallState>();
    if (callIds.length === 0) return out;
    const rows = await this.prisma.call.findMany({
      where: { id: { in: callIds } },
      select: {
        id: true,
        status: true,
        updated_at: true,
        duration_sec: true,
        end_reason: true,
      },
    });
    for (const r of rows) {
      out.set(r.id, {
        live: LIVE.has(r.status),
        status: r.status,
        heartbeatAt: r.updated_at.getTime(),
        durationSec: r.duration_sec,
        endReason: r.end_reason,
      });
    }
    return out;
  }

  async finish(
    i: HotlineCallFinish,
  ): Promise<{ conversationId: string | null }> {
    await this.prisma.hotlineCall.updateMany({
      where: { request_id: i.requestId, ended_at: null },
      data: {
        ended_at: new Date(i.endedAt),
        end_reason: i.reason.slice(0, 32),
        duration_sec: i.durationSec,
      },
    });
    // WhatsApp-style: after the call they go on in their ordinary direct
    // chat — the one chat of the pair, opened if new (the public chat API:
    // blocks and «who may message me» apply), started by the CLIENT.
    // Audit 17.11 #6 (owner rule: an attorney never calls a client): the
    // chat is NOT accepted on the attorney's behalf — accepting unlocks
    // contacts and 1:1 calls both ways. Like Uber / Lyft after a ride (the
    // rider reaches the driver through the app, numbers stay masked, the
    // driver cannot call the rider): the chat is open for messages both
    // ways, contacts stay masked (no 1:1 call button for either side), and
    // the client calls back through the hotline (POST /hotline/call-back),
    // which only he can start. A chat the pair already had unlocked (a
    // case, an earlier accepted chat) stays as it was.
    let conversationId: string | null = null;
    try {
      const conv = await this.chat.startDirect(
        as(i.clientId, 'client'),
        i.attorneyId,
      );
      conversationId = conv.id;
      if (!conv.contactsUnlocked) {
        await this.prisma.conversation.updateMany({
          where: {
            id: conv.id,
            request_status: 'pending',
            requested_by: i.clientId,
            contacts_unlocked: false,
          },
          // messages both ways (no «request» for the attorney to accept by
          // replying, which would unlock his calls), contacts locked
          data: { request_status: 'accepted' },
        });
      }
    } catch (err) {
      this.logger.info(
        { err: err instanceof Error ? err.message : err },
        'hotline: no direct chat after the call',
      );
    }
    if (conversationId) {
      await this.prisma.hotlineCall.updateMany({
        where: { request_id: i.requestId },
        data: { conversation_id: conversationId },
      });
    }
    return { conversationId };
  }
}
