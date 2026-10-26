import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { UsageHardStopService } from '../../common/ops/usage/usage-hard-stop.service';
import { SecretsService } from '../../common/secrets/secrets.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import {
  CLOUDFLARE_SFU_MAX_TRACKS_PER_REQUEST,
  CloudflareSfuError,
  type SfuTrackRequest,
  type SfuTracksResponse,
} from './cloudflare-sfu.client';
import { CloudflareSfuProvider } from './cloudflare-sfu.provider';
import { decideMediaProvider, type MediaDecision } from './media-provider';
import { CloudflareTransport } from './cloudflare-transport';
import {
  SFU_TRACK_NAMES,
  SfuStateStore,
  type SfuTrackName,
  type SfuUserState,
} from './sfu-state.store';

/** An unanswered SFU offer older than this no longer blocks new mutations. */
export const SFU_NEGOTIATION_STALE_MS = 15_000;
/** Simulcast layers (design doc §3.5): full, half, quarter. */
export const SFU_RIDS = ['f', 'h', 'q'] as const;
const MAX_SDP_CHARS = 64 * 1024;
const MID_PATTERN = /^[A-Za-z0-9_-]{1,16}$/;

/** What the calls service has already checked about the caller. */
export interface SfuCtx {
  callId: string;
  userId: string;
  /** False for a channel-call listener (design doc §6). */
  canPublish: boolean;
  /** Our own list of people with status `joined` right now. */
  joinedUserIds: string[];
}

export interface SfuSession {
  sessionId: string;
  iceServers: Array<{ urls: string[] }>;
}

export interface SfuPublishInput {
  sdp: string;
  tracks: Array<{ mid: string; trackName: string }>;
}

export interface SfuPublishResult {
  type: 'answer';
  sdp: string;
  tracks: Array<{ mid: string; trackName: SfuTrackName }>;
  failed: Array<{ trackName: string; errorCode: string }>;
}

export interface SfuSubscribeInput {
  userIds?: string[];
  trackNames?: string[];
  /** Simulcast layer of the pulled video: f | h | q (default h). */
  rid?: string;
}

export interface SfuSubscribeResult {
  requiresAnswer: boolean;
  type: 'offer' | null;
  sdp: string | null;
  subscriptions: Array<{
    userId: string;
    trackName: SfuTrackName;
    mid: string;
  }>;
  skipped: Array<{ userId: string; trackName: string; reason: string }>;
}

export interface SfuCloseInput {
  /** Stop publishing these of my own tracks. */
  trackNames?: string[];
  /** Stop receiving these people. */
  userIds?: string[];
  /** The phone's offer after it stopped the transceivers (pulled tracks). */
  sdp?: string;
}

export interface SfuCloseResult {
  closed: string[];
  type: 'answer' | null;
  sdp: string | null;
}

export interface SfuReadiness {
  /** userId -> the tracks they publish right now. */
  tracksByUser: Record<string, SfuTrackName[]>;
}

const mediaDown = (message = 'The media service is not available.') =>
  new ServiceUnavailableException({
    code: ErrorCode.CALL_MEDIA_UNAVAILABLE,
    message,
  });

const conflict = (message: string) =>
  new ConflictException({ code: ErrorCode.CALL_STATE_CONFLICT, message });

const invalid = (message: string, field: string) =>
  new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message,
    details: { field },
  });

function checkSdp(sdp: unknown): string {
  if (
    typeof sdp !== 'string' ||
    sdp.length === 0 ||
    sdp.length > MAX_SDP_CHARS ||
    !sdp.startsWith('v=0')
  ) {
    throw invalid('Not a valid SDP.', 'sdp');
  }
  return sdp;
}

function trackNameOf(name: unknown): SfuTrackName {
  if (!(SFU_TRACK_NAMES as readonly string[]).includes(name as string)) {
    throw invalid('Unknown track name (mic or cam).', 'trackName');
  }
  return name as SfuTrackName;
}

/**
 * Owner 2026-10-24: the API side of group calls on Cloudflare Realtime SFU
 * (design doc docs/architecture/GROUP_CALLS_CLOUDFLARE_SFU.md). The phone
 * never talks to Cloudflare over HTTP; it asks us, and we
 *  - take the publisher's session id only from our own state (a phone can
 *    pull a person of this call, never an arbitrary session),
 *  - allow only `mic` / `cam`,
 *  - run one mutation at a time per session,
 *  - and close everything of a person who leaves, is kicked, goes silent,
 *    or whose call ends.
 * Who may call these methods (a joined person of a live Cloudflare call) is
 * decided by CallsService before it builds the [SfuCtx].
 *
 * End-to-end encryption is planned for a later step: the per-call media key
 * would be handed out next to the session (see `createSession`), not mixed
 * into the SDP flow; nothing here depends on it.
 */
@Injectable()
export class SfuBrokerService {
  private readonly logger = new Logger(SfuBrokerService.name);
  readonly provider: CloudflareSfuProvider;
  readonly store: SfuStateStore;
  /** Owner 2026-10-26: Cloudflare primary, own path as the automatic
   * backup (shared breaker in Redis; CallsService uses it for TURN too). */
  readonly transport: CloudflareTransport;

  constructor(
    @Optional() secrets?: SecretsService,
    @Optional() config?: ConfigService,
    @Optional() @Inject(REDIS_CLIENT) redis?: Redis,
    @Optional() private readonly settings?: AppSettingsService,
    // Cost registry V7: fall back to device-to-device at the urgent traffic level.
    @Optional() private readonly hardStop?: UsageHardStopService,
  ) {
    this.provider = new CloudflareSfuProvider(secrets, config);
    this.store = new SfuStateStore(redis);
    this.transport = new CloudflareTransport(redis, settings);
  }

  // --- Start of a call: health and the fallback ---------------------------

  /**
   * `calls.video_provider` as the app should read it NOW: a `cloudflare`
   * choice becomes `p2p` while the Cloudflare hard stop is on (cost registry
   * V7, `scale.cloudflare_hardstop.mode`): this month's Realtime traffic
   * reached the urgent level, so group calls leave the paid pool. Calls are
   * never refused.
   */
  async effectiveChoice(choice: string): Promise<string> {
    if (
      choice === 'cloudflare' &&
      (await this.hardStop?.stopped('cloudflare'))
    ) {
      return 'p2p';
    }
    return choice;
  }

  /** The Cloudflare cost hard stop is on (cost registry V7). */
  async hardStopped(): Promise<boolean> {
    return (await this.hardStop?.stopped('cloudflare')) === true;
  }

  /**
   * Owner 2026-10-26: Cloudflare SHOULD carry group calls — the SFU keys are
   * in Integrations and `calls.transport` is not `own`. (Whether it does for
   * a new call also depends on the breaker; see [decide].)
   */
  async cloudflareWanted(): Promise<boolean> {
    if ((await this.transport.mode()) === 'own') return false;
    return this.provider.isConfigured();
  }

  /**
   * Decides (and returns) how a new group call carries its media. Owner
   * 2026-10-26: Cloudflare SFU first whenever its keys are set (no admin
   * switch needed); our own mesh only while the breaker is open, the cost
   * hard stop is on, or `calls.transport` = own. Nothing is asked of
   * Cloudflare while it is healthy; while open, one probe a minute.
   */
  async decide(input: {
    isGroup: boolean;
    video: boolean;
    headcount: number;
  }): Promise<MediaDecision> {
    let useCloudflare = false;
    let wanted = false;
    if (input.isGroup) {
      wanted = await this.cloudflareWanted();
      if (wanted && !(await this.hardStopped())) {
        const d = await this.transport.decide('sfu', true, () =>
          this.provider.probe(),
        );
        useCloudflare = d.use;
      }
    }
    const meshVideoMax = this.settings
      ? await this.settings.number('calls.sfu_fallback_mesh_max')
      : 4;
    const d = decideMediaProvider({
      isGroup: input.isGroup,
      video: input.video,
      headcount: input.headcount,
      useCloudflare,
      cloudflareWanted: wanted,
      meshVideoMax,
    });
    if (d.degraded) {
      this.logger.warn(
        `Cloudflare SFU not used (backup path): group call of ${input.headcount} runs device-to-device${d.video === input.video ? '' : ' (audio only)'}`,
      );
    }
    return d;
  }

  // --- Errors ----------------------------------------------------------------

  /** Maps Cloudflare failures to ours; counts outages for the health check. */
  private fail(e: unknown, what: string): never {
    if (e instanceof CloudflareSfuError) {
      // Owner 2026-10-26: outages and a refused key both count against the
      // Cloudflare path (shared breaker -> new calls take our own path).
      if (e.isOutage || e.status === 401 || e.status === 403) {
        void this.transport
          .recordFailure('sfu', `${what}: ${e.message}`)
          .catch(() => undefined);
      }
      // The message of CloudflareSfuError never holds the App Secret.
      this.logger.warn(`Cloudflare SFU ${what} failed: ${e.message}`);
      if (e.isOutage || e.status === 401 || e.status === 403) throw mediaDown();
      throw conflict(`The media service refused this (${e.code ?? e.status}).`);
    }
    throw e;
  }

  private async client() {
    const c = await this.provider.client();
    if (!c) throw mediaDown('The media service is not configured.');
    return c;
  }

  private assertFreshNegotiation(st: SfuUserState): void {
    if (
      st.negotiatingSince !== null &&
      Date.now() - st.negotiatingSince < SFU_NEGOTIATION_STALE_MS
    ) {
      throw conflict('Answer the previous offer first.');
    }
  }

  private async stateOrThrow(ctx: SfuCtx): Promise<SfuUserState> {
    const st = await this.store.get(ctx.callId, ctx.userId);
    if (!st) throw conflict('Open an SFU session first.');
    return st;
  }

  // --- 1. Session --------------------------------------------------------------

  /**
   * One Cloudflare session per person per call = one PeerConnection. A second
   * request (reconnect after more than the 30 s window) replaces the old
   * session: its published tracks are closed first.
   */
  createSession(ctx: SfuCtx): Promise<SfuSession> {
    return this.store.withSession(ctx.callId, ctx.userId, async () => {
      const client = await this.client();
      const old = await this.store.get(ctx.callId, ctx.userId);
      if (old) await this.closeOwnQuietly(old);
      let sessionId: string;
      try {
        ({ sessionId } = await client.newSession());
      } catch (e) {
        this.fail(e, 'sessions/new');
      }
      await this.store.set(ctx.callId, ctx.userId, {
        sessionId,
        tracks: {},
        pulls: {},
        negotiatingSince: null,
        createdAt: Date.now(),
      });
      return {
        sessionId,
        // Media goes to Cloudflare's public addresses; TURN for hard
        // networks comes from GET /calls/ice-servers as for any call.
        iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }],
      };
    });
  }

  // --- 2. Publish ----------------------------------------------------------------

  async publish(
    ctx: SfuCtx,
    input: SfuPublishInput,
  ): Promise<SfuPublishResult> {
    if (!ctx.canPublish) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Listeners cannot publish in this call.',
      });
    }
    const sdp = checkSdp(input.sdp);
    const names = new Set<string>();
    const wanted = (input.tracks ?? []).map((t) => {
      const trackName = trackNameOf(t.trackName);
      if (typeof t.mid !== 'string' || !MID_PATTERN.test(t.mid)) {
        throw invalid('Not a valid mid.', 'mid');
      }
      if (names.has(trackName)) throw invalid('Duplicate track.', 'trackName');
      names.add(trackName);
      return { mid: t.mid, trackName };
    });
    if (wanted.length === 0) throw invalid('No tracks.', 'tracks');

    return await this.store.withSession(ctx.callId, ctx.userId, async () => {
      const st = await this.stateOrThrow(ctx);
      this.assertFreshNegotiation(st);
      for (const w of wanted) {
        if (st.tracks[w.trackName]) {
          throw conflict(
            `${w.trackName} is already published; close it first.`,
          );
        }
      }
      const client = await this.client();
      const req: SfuTrackRequest[] = wanted.map((w) => ({
        location: 'local',
        mid: w.mid,
        trackName: w.trackName,
      }));
      let res: SfuTracksResponse;
      try {
        res = await client.newTracks(st.sessionId, req, {
          type: 'offer',
          sdp,
        });
      } catch (e) {
        this.fail(e, 'tracks/new (publish)');
      }
      const failed: SfuPublishResult['failed'] = [];
      const ok: SfuPublishResult['tracks'] = [];
      for (const w of wanted) {
        const r = (res.tracks ?? []).find(
          (t) => t.trackName === w.trackName || t.mid === w.mid,
        );
        if (!r || r.errorCode) {
          failed.push({
            trackName: w.trackName,
            errorCode: r?.errorCode ?? 'missing',
          });
        } else {
          st.tracks[w.trackName] = r.mid ?? w.mid;
          ok.push({ mid: r.mid ?? w.mid, trackName: w.trackName });
        }
      }
      if (ok.length === 0 || !res.sessionDescription?.sdp) {
        throw conflict('The media service did not accept the tracks.');
      }
      await this.store.set(ctx.callId, ctx.userId, st);
      return {
        type: 'answer',
        sdp: res.sessionDescription.sdp,
        tracks: ok,
        failed,
      };
    });
  }

  // --- 3. Pull -----------------------------------------------------------------

  async subscribe(
    ctx: SfuCtx,
    input: SfuSubscribeInput,
  ): Promise<SfuSubscribeResult> {
    const rid = input.rid ?? 'h';
    if (!(SFU_RIDS as readonly string[]).includes(rid)) {
      throw invalid('rid is f, h or q.', 'rid');
    }
    const kinds = (input.trackNames ?? [...SFU_TRACK_NAMES]).map(trackNameOf);
    return await this.store.withSession(ctx.callId, ctx.userId, async () => {
      const me = await this.stateOrThrow(ctx);
      this.assertFreshNegotiation(me);
      const joined = new Set(ctx.joinedUserIds);
      const targets = (input.userIds ?? ctx.joinedUserIds).filter(
        (u) => u !== ctx.userId,
      );
      const wanted: SfuTrackRequest[] = [];
      const owners: Array<{
        userId: string;
        trackName: SfuTrackName;
        sessionId: string;
      }> = [];
      const skipped: SfuSubscribeResult['skipped'] = [];
      const already = new Set(
        Object.values(me.pulls).map(
          (p) => `${p.userId}:${p.trackName}:${p.publisherSessionId}`,
        ),
      );
      for (const userId of new Set(targets)) {
        // The publisher must be a joined person of THIS call and have a
        // session of ours; its session id never comes from the request.
        if (!joined.has(userId)) {
          skipped.push({ userId, trackName: '*', reason: 'not_in_call' });
          continue;
        }
        const pub = await this.store.get(ctx.callId, userId);
        if (!pub) {
          skipped.push({ userId, trackName: '*', reason: 'not_published' });
          continue;
        }
        for (const trackName of kinds) {
          if (!pub.tracks[trackName]) {
            skipped.push({ userId, trackName, reason: 'not_published' });
          } else if (already.has(`${userId}:${trackName}:${pub.sessionId}`)) {
            skipped.push({ userId, trackName, reason: 'already_pulled' });
          } else if (wanted.length >= CLOUDFLARE_SFU_MAX_TRACKS_PER_REQUEST) {
            skipped.push({ userId, trackName, reason: 'batch_limit' });
          } else {
            wanted.push({
              location: 'remote',
              sessionId: pub.sessionId,
              trackName,
              ...(trackName === 'cam'
                ? { simulcast: { preferredRid: rid } }
                : {}),
            });
            owners.push({ userId, trackName, sessionId: pub.sessionId });
          }
        }
      }
      if (wanted.length === 0) {
        return {
          requiresAnswer: false,
          type: null,
          sdp: null,
          subscriptions: [],
          skipped,
        };
      }
      const client = await this.client();
      let res: SfuTracksResponse;
      try {
        res = await client.newTracks(me.sessionId, wanted);
      } catch (e) {
        this.fail(e, 'tracks/new (pull)');
      }
      const subscriptions: SfuSubscribeResult['subscriptions'] = [];
      for (const o of owners) {
        const r = (res.tracks ?? []).find(
          (t) => t.sessionId === o.sessionId && t.trackName === o.trackName,
        );
        if (!r || r.errorCode || !r.mid) {
          skipped.push({
            userId: o.userId,
            trackName: o.trackName,
            reason: r?.errorCode ?? 'missing',
          });
          continue;
        }
        me.pulls[r.mid] = {
          userId: o.userId,
          trackName: o.trackName,
          publisherSessionId: o.sessionId,
        };
        subscriptions.push({
          userId: o.userId,
          trackName: o.trackName,
          mid: r.mid,
        });
      }
      const needsAnswer =
        res.requiresImmediateRenegotiation === true &&
        res.sessionDescription?.type === 'offer';
      me.negotiatingSince = needsAnswer ? Date.now() : me.negotiatingSince;
      await this.store.set(ctx.callId, ctx.userId, me);
      return {
        requiresAnswer: needsAnswer,
        type: needsAnswer ? 'offer' : null,
        sdp: needsAnswer ? (res.sessionDescription?.sdp ?? null) : null,
        subscriptions,
        skipped,
      };
    });
  }

  // --- 4. Renegotiate (the phone's answer) -----------------------------------------

  async answer(ctx: SfuCtx, sdpIn: string): Promise<{ ok: true }> {
    const sdp = checkSdp(sdpIn);
    return await this.store.withSession(ctx.callId, ctx.userId, async () => {
      const st = await this.stateOrThrow(ctx);
      if (st.negotiatingSince === null) {
        throw conflict('There is no offer waiting for an answer.');
      }
      const client = await this.client();
      try {
        await client.renegotiate(st.sessionId, { type: 'answer', sdp });
      } catch (e) {
        // A refused answer must not wedge the session for good.
        if (e instanceof CloudflareSfuError && !e.isOutage) {
          st.negotiatingSince = null;
          await this.store.set(ctx.callId, ctx.userId, st);
        }
        this.fail(e, 'renegotiate');
      }
      st.negotiatingSince = null;
      await this.store.set(ctx.callId, ctx.userId, st);
      return { ok: true as const };
    });
  }

  // --- 5. Close tracks -------------------------------------------------------------

  async close(ctx: SfuCtx, input: SfuCloseInput): Promise<SfuCloseResult> {
    const own = (input.trackNames ?? []).map(trackNameOf);
    const peers = input.userIds ?? [];
    if (own.length === 0 && peers.length === 0) {
      throw invalid('Nothing to close.', 'trackNames');
    }
    const offer = input.sdp === undefined ? undefined : checkSdp(input.sdp);
    return await this.store.withSession(ctx.callId, ctx.userId, async () => {
      const st = await this.stateOrThrow(ctx);
      this.assertFreshNegotiation(st);
      const mids: string[] = [];
      const pulledMids: string[] = [];
      for (const n of own) {
        const mid = st.tracks[n];
        if (mid) mids.push(mid);
      }
      for (const [mid, p] of Object.entries(st.pulls)) {
        if (peers.includes(p.userId)) {
          mids.push(mid);
          pulledMids.push(mid);
        }
      }
      if (mids.length === 0) return { closed: [], type: null, sdp: null };
      const client = await this.client();
      // Pulled tracks are closed with the phone's offer (it stopped the
      // transceivers); without one, or for our own tracks, force-close.
      const withOffer = offer !== undefined && pulledMids.length > 0;
      let res: SfuTracksResponse;
      try {
        res = await client.closeTracks(st.sessionId, mids, {
          force: !withOffer,
          ...(withOffer
            ? { sessionDescription: { type: 'offer', sdp: offer } }
            : {}),
        });
      } catch (e) {
        this.fail(e, 'tracks/close');
      }
      for (const n of own) delete st.tracks[n];
      for (const mid of pulledMids) delete st.pulls[mid];
      await this.store.set(ctx.callId, ctx.userId, st);
      const answer =
        withOffer && res.sessionDescription?.type === 'answer'
          ? res.sessionDescription.sdp
          : null;
      return { closed: mids, type: answer ? 'answer' : null, sdp: answer };
    });
  }

  // --- 6. Simulcast layer -------------------------------------------------------------

  async setLayer(
    ctx: SfuCtx,
    input: { userId: string; rid: string },
  ): Promise<{ ok: true }> {
    if (!(SFU_RIDS as readonly string[]).includes(input.rid)) {
      throw invalid('rid is f, h or q.', 'rid');
    }
    return await this.store.withSession(ctx.callId, ctx.userId, async () => {
      const st = await this.stateOrThrow(ctx);
      const entry = Object.entries(st.pulls).find(
        ([, p]) => p.userId === input.userId && p.trackName === 'cam',
      );
      if (!entry) throw conflict('You do not receive that camera.');
      const [mid, p] = entry;
      const client = await this.client();
      try {
        // ASSUMED shape (the docs name the call, the sample is not in the
        // OpenAPI file): a remote track addressed by mid + simulcast.
        await client.updateTracks(st.sessionId, [
          {
            location: 'remote',
            mid,
            trackName: p.trackName,
            sessionId: p.publisherSessionId,
            simulcast: { preferredRid: input.rid },
          },
        ]);
      } catch (e) {
        this.fail(e, 'tracks/update');
      }
      return { ok: true as const };
    });
  }

  // --- Reading -------------------------------------------------------------------------

  /** Who publishes what now: feeds `sfuReady` / `sfuTracks` of the roster. */
  async readiness(callId: string): Promise<SfuReadiness> {
    const all = await this.store.all(callId);
    const tracksByUser: Record<string, SfuTrackName[]> = {};
    for (const [u, st] of Object.entries(all)) {
      tracksByUser[u] = SFU_TRACK_NAMES.filter((n) => st.tracks[n]);
    }
    return { tracksByUser };
  }

  // --- Cleanup (leave, kick, sweep, finish) ------------------------------------------------

  /** Best effort: Cloudflare may already have dropped the session. */
  private async closeOwnQuietly(st: SfuUserState): Promise<void> {
    const mids = SFU_TRACK_NAMES.map((n) => st.tracks[n]).filter(
      (m): m is string => Boolean(m),
    );
    if (mids.length === 0) return;
    try {
      const client = await this.provider.client();
      await client?.closeTracks(st.sessionId, mids, { force: true });
    } catch (e) {
      this.logger.warn(
        `Cloudflare SFU cleanup failed: ${e instanceof Error ? e.message : 'error'}`,
      );
    }
  }

  /** One person is out of the call: their published tracks are closed (so
   * everybody stops receiving them) and their state is forgotten. */
  cleanupUser(callId: string, userId: string): Promise<void> {
    return this.store.withSession(callId, userId, async () => {
      const st = await this.store.get(callId, userId);
      if (!st) return;
      await this.closeOwnQuietly(st);
      await this.store.del(callId, userId);
    });
  }

  /** Anyone with state who is not `joined` any more is cleaned up. */
  async reconcile(callId: string, joinedUserIds: string[]): Promise<void> {
    const joined = new Set(joinedUserIds);
    const all = await this.store.all(callId);
    await Promise.all(
      Object.keys(all)
        .filter((u) => !joined.has(u))
        .map((u) =>
          this.cleanupUser(callId, u).catch((e: unknown) =>
            this.logger.warn(
              `SFU cleanup of a participant failed: ${e instanceof Error ? e.message : 'error'}`,
            ),
          ),
        ),
    );
  }

  /** The call is over: close everything, forget everything. */
  async closeCall(callId: string): Promise<void> {
    const all = await this.store.all(callId);
    await Promise.all(
      Object.entries(all).map(([u]) =>
        this.cleanupUser(callId, u).catch(() => undefined),
      ),
    );
    await this.store.delCall(callId);
  }
}
