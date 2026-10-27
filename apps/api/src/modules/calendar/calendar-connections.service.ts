import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { CalendarConnection } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { CalendarConfig } from './calendar-config.service';
import {
  CalendarAuthError,
  providerApi,
  type CalendarProviderApi,
  type CalendarProviderId,
} from './calendar-providers';

const STATE_AAD = 'calendar-oauth-state';
const STATE_TTL_MS = 10 * 60_000;
const TOKEN_AAD = (connectionId: string) =>
  `calendar_connections.refresh_token:${connectionId}`;

export interface ConnectionView {
  provider: CalendarProviderId;
  accountEmail: string | null;
  status: 'active' | 'needs_reauth';
  readBusy: boolean;
  writeEvents: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

export const asProvider = (v: string): CalendarProviderId => {
  if (v === 'google' || v === 'microsoft') return v;
  throw new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Unknown calendar.',
  });
};

/**
 * Owner 2026-10-28: linking a person's own Google / Outlook calendar. Code
 * is complete even while the admin switch is OFF: with the switch off (or
 * no OAuth app saved) every entry point answers FEATURE_DISABLED /
 * INTEGRATIONS_NOT_CONFIGURED and nothing is stored.
 */
@Injectable()
export class CalendarConnectionsService {
  private readonly tokens = new Map<string, { token: string; exp: number }>();
  /** Test seam. */
  apiFor: (p: CalendarProviderId) => CalendarProviderApi = (p) =>
    providerApi(p);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: CalendarConfig,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CalendarConnectionsService.name);
  }

  async list(userId: string): Promise<ConnectionView[]> {
    const rows = await this.prisma.calendarConnection.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'asc' },
    });
    return rows.map((r) => this.view(r));
  }

  /** Step 1: the vendor's consent page URL. */
  async start(
    userId: string,
    provider: CalendarProviderId,
  ): Promise<{ url: string }> {
    const app = await this.assertUsable(provider);
    const state = this.cfg.seal(
      JSON.stringify({
        u: userId,
        p: provider,
        exp: Date.now() + STATE_TTL_MS,
        n: randomUUID(),
      }),
      STATE_AAD,
    );
    return {
      url: this.apiFor(provider).authUrl(
        app,
        this.cfg.redirectUri(provider),
        state,
      ),
    };
  }

  /** Step 2: the vendor sends the person back here with a code. */
  async finish(
    provider: CalendarProviderId,
    code: string,
    state: string,
  ): Promise<ConnectionView> {
    const app = await this.assertUsable(provider);
    let payload: { u: string; p: string; exp: number };
    try {
      payload = JSON.parse(this.cfg.open(state, STATE_AAD)) as typeof payload;
    } catch {
      throw this.bad('Bad or expired link. Start again.');
    }
    if (payload.p !== provider || payload.exp < Date.now()) {
      throw this.bad('Bad or expired link. Start again.');
    }
    const api = this.apiFor(provider);
    const t = await api
      .exchangeCode(app, this.cfg.redirectUri(provider), code)
      .catch((e: unknown) => {
        this.logger.warn(
          { err: String(e), provider },
          'calendar code exchange failed',
        );
        throw this.bad('The calendar did not accept the sign-in. Try again.');
      });
    if (!t.refreshToken) {
      throw this.bad(
        'No permission to stay connected. Allow access and try again.',
      );
    }
    const existing = await this.prisma.calendarConnection.findUnique({
      where: { user_id_provider: { user_id: payload.u, provider } },
      select: { id: true },
    });
    const id = existing?.id ?? randomUUID();
    const data = {
      account_email: t.email ?? null,
      refresh_token_enc: this.cfg.seal(t.refreshToken, TOKEN_AAD(id)),
      status: 'active',
      last_error: null,
    };
    const row = existing
      ? await this.prisma.calendarConnection.update({ where: { id }, data })
      : await this.prisma.calendarConnection.create({
          data: {
            id,
            user_id: payload.u,
            provider,
            ...data,
            // Everything still ahead is pushed on the first sweep.
            sync_cursor: new Date('2000-01-01T00:00:00Z'),
          },
        });
    this.tokens.set(id, {
      token: t.accessToken,
      exp: Date.now() + t.expiresIn * 1000 - 60_000,
    });
    return this.view(row);
  }

  async update(
    userId: string,
    provider: CalendarProviderId,
    patch: { readBusy?: boolean; writeEvents?: boolean },
  ): Promise<ConnectionView> {
    const row = await this.prisma.calendarConnection.findUnique({
      where: { user_id_provider: { user_id: userId, provider } },
    });
    if (!row) throw this.notFound();
    const updated = await this.prisma.calendarConnection.update({
      where: { id: row.id },
      data: {
        ...(patch.readBusy !== undefined ? { read_busy: patch.readBusy } : {}),
        ...(patch.writeEvents !== undefined
          ? { write_events: patch.writeEvents }
          : {}),
      },
    });
    return this.view(updated);
  }

  async disconnect(
    userId: string,
    provider: CalendarProviderId,
  ): Promise<void> {
    const row = await this.prisma.calendarConnection.findUnique({
      where: { user_id_provider: { user_id: userId, provider } },
    });
    if (!row) return;
    const app = await this.cfg.oauthApp(provider);
    if (app && this.cfg.canSeal) {
      try {
        await this.apiFor(provider).revoke(
          app,
          this.cfg.open(row.refresh_token_enc, TOKEN_AAD(row.id)),
        );
      } catch {
        // Best effort: our copy is dropped below either way.
      }
    }
    this.tokens.delete(row.id);
    await this.prisma.calendarConnection.delete({ where: { id: row.id } });
  }

  /**
   * A working access token (cached until a minute before it ends). A refusal
   * by the vendor parks the connection as «needs_reauth» and rethrows.
   */
  async accessTokenFor(c: CalendarConnection): Promise<string> {
    const hit = this.tokens.get(c.id);
    if (hit && hit.exp > Date.now()) return hit.token;
    const provider = asProvider(c.provider);
    const app = await this.cfg.oauthApp(provider);
    if (!app) throw new CalendarAuthError('OAuth app is not configured');
    try {
      const t = await this.apiFor(provider).refresh(
        app,
        this.cfg.open(c.refresh_token_enc, TOKEN_AAD(c.id)),
      );
      this.tokens.set(c.id, {
        token: t.accessToken,
        exp: Date.now() + t.expiresIn * 1000 - 60_000,
      });
      return t.accessToken;
    } catch (e) {
      if (e instanceof CalendarAuthError) await this.park(c.id, String(e));
      throw e;
    }
  }

  forget(connectionId: string): void {
    this.tokens.delete(connectionId);
  }

  async park(connectionId: string, error: string): Promise<void> {
    this.tokens.delete(connectionId);
    await this.prisma.calendarConnection
      .updateMany({
        where: { id: connectionId },
        data: { status: 'needs_reauth', last_error: error.slice(0, 300) },
      })
      .catch(() => undefined);
  }

  private async assertUsable(provider: CalendarProviderId) {
    if (!(await this.cfg.providerEnabled(provider))) {
      throw new ForbiddenException({
        code: ErrorCode.FEATURE_DISABLED,
        message: 'This calendar link is switched off.',
      });
    }
    const app = await this.cfg.oauthApp(provider);
    if (!app || !this.cfg.canSeal) {
      throw new ServiceUnavailableException({
        code: ErrorCode.INTEGRATIONS_NOT_CONFIGURED,
        message: 'This calendar link is not set up yet.',
      });
    }
    return app;
  }

  private view(r: CalendarConnection): ConnectionView {
    return {
      provider: asProvider(r.provider),
      accountEmail: r.account_email,
      status: r.status === 'needs_reauth' ? 'needs_reauth' : 'active',
      readBusy: r.read_busy,
      writeEvents: r.write_events,
      lastSyncAt: r.last_sync_at?.toISOString() ?? null,
      lastError: r.last_error,
    };
  }

  private bad(message: string): BadRequestException {
    return new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message,
    });
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'Not connected.',
    });
  }
}
