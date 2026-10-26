import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { Public } from '../auth/decorators/public.decorator';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { CalendarConfig } from './calendar-config.service';
import { verifyIcsLink } from './calendar-links';
import {
  asProvider,
  CalendarConnectionsService,
} from './calendar-connections.service';
import {
  CalendarConnectionDto,
  CalendarConnectStartDto,
  CalendarFeedLinkDto,
  CalendarFeedStatusDto,
  CalendarProviderParamDto,
  CalendarProvidersDto,
  IcsLinkQueryDto,
  OAuthCallbackQueryDto,
  UpdateCalendarConnectionDto,
} from './calendar.dto';
import { buildIcs } from './ics-builder';
import { IcsFeedService } from './ics-feed.service';

const E = ErrorCode;
const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Owner 2026-10-28: the calendar. A secret .ics link (subscribe in Apple /
 * Google / Outlook), one-event .ics links, and linking a Google / Outlook
 * calendar. No screens yet: the app can call these when it gets them.
 */
@ApiTags('calendar')
@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly feed: IcsFeedService,
    private readonly connections: CalendarConnectionsService,
    private readonly cfg: CalendarConfig,
  ) {}

  // --- the secret feed link ----------------------------------------------------

  @ApiBearerAuth()
  @ApiErrors(AUTHENTICATED_ERRORS)
  @Get('feed')
  @ApiOperation({
    summary:
      'Do I have a calendar link? (the link itself is never shown again)',
  })
  @ApiEnvelopeResponse(CalendarFeedStatusDto)
  async feedStatus(
    @CurrentUser() user: RequestUser,
  ): Promise<CalendarFeedStatusDto> {
    const s = await this.feed.status(user.sub);
    return {
      enabled: await this.cfg.feedEnabled(),
      hasLink: s.hasLink,
      createdAt: s.createdAt?.toISOString() ?? null,
      lastUsedAt: s.lastUsedAt?.toISOString() ?? null,
    };
  }

  @ApiBearerAuth()
  @ApiErrors({ ...AUTHENTICATED_ERRORS, 403: [E.FEATURE_DISABLED] })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('feed')
  @ApiOperation({
    summary:
      'Create a new secret calendar link; the old one stops working. The link is returned once.',
  })
  @ApiEnvelopeResponse(CalendarFeedLinkDto)
  async createFeed(
    @CurrentUser() user: RequestUser,
  ): Promise<CalendarFeedLinkDto> {
    const r = await this.feed.rotate(user.sub);
    return {
      url: r.url,
      webcalUrl: r.webcalUrl,
      createdAt: r.createdAt.toISOString(),
    };
  }

  @ApiBearerAuth()
  @ApiErrors(AUTHENTICATED_ERRORS)
  @Delete('feed')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the calendar link' })
  async deleteFeed(@CurrentUser() user: RequestUser): Promise<void> {
    await this.feed.revoke(user.sub);
  }

  /**
   * The feed itself, fetched by the calendar app with no login: the secret
   * in the URL is the key. Unknown / revoked → 404. ETag + 304 so a poll of
   * an unchanged calendar costs the database reads but sends no body.
   */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('feed/:file')
  @ApiOperation({ summary: 'The .ics feed (secret link, no login)' })
  @ApiProduces('text/calendar')
  @ApiErrors({ 404: [E.NOT_FOUND] })
  async feedFile(
    @Param('file') file: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.feed.userForToken(file.replace(/\.ics$/, ''));
    res.set({
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    if (!userId) {
      res.status(404).type('text/plain').send('Not found');
      return;
    }
    const built = await this.feed.build(userId);
    res.set({
      'Cache-Control': 'private, max-age=300, must-revalidate',
      ETag: built.etag,
      ...(built.lastModified.getTime() > 0
        ? { 'Last-Modified': built.lastModified.toUTCString() }
        : {}),
    });
    if (req.headers['if-none-match'] === built.etag) {
      res.status(304).end();
      return;
    }
    res
      .status(200)
      .type('text/calendar; charset=utf-8')
      .set('Content-Disposition', 'inline; filename="lawbid.ics"')
      .send(built.body);
  }

  /** One event, from a link we signed (consultation / deadline result). */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('event.ics')
  @ApiOperation({ summary: 'A one-event .ics file from a signed link' })
  @ApiProduces('text/calendar')
  @ApiErrors({ 404: [E.NOT_FOUND] })
  eventIcs(@Query() q: IcsLinkQueryDto, @Res() res: Response): void {
    const e = verifyIcsLink(q.d, q.sig, this.cfg.signingSecret());
    if (!e) {
      res.status(404).type('text/plain').send('Not found');
      return;
    }
    const body = buildIcs(
      [
        {
          uid: e.uid,
          title: e.title,
          description: e.description,
          location: e.location,
          category: e.date ? 'deadline' : 'consultation',
          start: e.start,
          end: e.end,
          date: e.date,
          updatedAt: e.start ?? new Date(`${e.date}T00:00:00Z`),
        },
      ],
      { name: 'LawBid' },
    );
    res
      .status(200)
      .set({
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': 'attachment; filename="lawbid-event.ics"',
      })
      .type('text/calendar; charset=utf-8')
      .send(body);
  }

  // --- Google / Outlook ----------------------------------------------------------

  @ApiBearerAuth()
  @ApiErrors(AUTHENTICATED_ERRORS)
  @Get('connections')
  @ApiOperation({
    summary: 'Linked Google / Outlook calendars and which links are on',
  })
  @ApiEnvelopeResponse(CalendarProvidersDto)
  async listConnections(
    @CurrentUser() user: RequestUser,
  ): Promise<CalendarProvidersDto> {
    const [googleEnabled, microsoftEnabled, connections] = await Promise.all([
      this.cfg.providerEnabled('google'),
      this.cfg.providerEnabled('microsoft'),
      this.connections.list(user.sub),
    ]);
    return { googleEnabled, microsoftEnabled, connections };
  }

  @ApiBearerAuth()
  @ApiErrors({
    ...AUTHENTICATED_ERRORS,
    403: [E.FEATURE_DISABLED],
    503: [E.INTEGRATIONS_NOT_CONFIGURED],
  })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('connections/:provider/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Step 1 of linking: the vendor sign-in page to open',
  })
  @ApiEnvelopeResponse(CalendarConnectStartDto)
  startConnection(
    @CurrentUser() user: RequestUser,
    @Param() p: CalendarProviderParamDto,
  ): Promise<CalendarConnectStartDto> {
    return this.connections.start(user.sub, p.provider);
  }

  @ApiBearerAuth()
  @ApiErrors({ ...AUTHENTICATED_ERRORS, 404: [E.NOT_FOUND] })
  @Patch('connections/:provider')
  @ApiOperation({
    summary: 'Choose what the link does (busy time / write events)',
  })
  @ApiEnvelopeResponse(CalendarConnectionDto)
  updateConnection(
    @CurrentUser() user: RequestUser,
    @Param() p: CalendarProviderParamDto,
    @Body() dto: UpdateCalendarConnectionDto,
  ): Promise<CalendarConnectionDto> {
    return this.connections.update(user.sub, p.provider, dto);
  }

  @ApiBearerAuth()
  @ApiErrors(AUTHENTICATED_ERRORS)
  @Delete('connections/:provider')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Unlink the calendar (the sign-in is revoked where possible)',
  })
  async disconnectConnection(
    @CurrentUser() user: RequestUser,
    @Param() p: CalendarProviderParamDto,
  ): Promise<void> {
    await this.connections.disconnect(user.sub, p.provider);
  }

  /** Where the vendor sends the person back; shows a plain result page. */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('oauth/:provider/callback')
  @ApiOperation({ summary: 'OAuth return address (the vendor calls it)' })
  @ApiProduces('text/html')
  async oauthCallback(
    @Param('provider') providerRaw: string,
    @Query() q: OAuthCallbackQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    res.set({
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'",
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    });
    const page = (status: number, title: string, text: string) =>
      res
        .status(status)
        .type('text/html; charset=utf-8')
        .send(
          `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><body style="font-family:system-ui;margin:3rem 1.5rem;text-align:center"><h2>${esc(title)}</h2><p>${esc(text)}</p></body>`,
        );
    try {
      const provider = asProvider(providerRaw);
      if (q.error || !q.code || !q.state) {
        page(
          400,
          'Not connected',
          'The calendar was not connected. Go back to LawBid and try again.',
        );
        return;
      }
      await this.connections.finish(provider, q.code, q.state);
      page(
        200,
        'Calendar connected',
        'You can close this page and return to LawBid.',
      );
    } catch {
      page(
        400,
        'Not connected',
        'The link expired or the calendar link is switched off. Go back to LawBid and try again.',
      );
    }
  }
}
