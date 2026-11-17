import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { CallsService } from '../calls/calls.service';
import { ChatService } from '../chat/chat.service';

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
}

const LIVE = new Set(['ringing', 'active']);

const as = (sub: string, role: 'client' | 'attorney'): RequestUser =>
  ({ sub, role }) as RequestUser;

@Injectable()
export class CallsHotlineBridge implements HotlineCallBridge {
  private callsSvc?: CallsService;
  private chatSvc?: ChatService;

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
