import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { SkipVersionCheck } from '../feature-flags/decorators/skip-version-check.decorator';
import { OutreachService } from './outreach.service';

const PAGE = (title: string, text: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<title>${title}</title></head><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0B0B0D;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">` +
  `<div style="max-width:420px;padding:32px;text-align:center"><h1 style="color:#C9A24A;font-size:22px">${title}</h1><p style="opacity:.8">${text}</p></div></body></html>`;

/** CAN-SPAM unsubscribe link printed in every cold email; opened in a
 * browser, so no app version header and no sign-in. */
@ApiTags('outreach')
@Controller('outreach')
export class OutreachController {
  constructor(private readonly outreach: OutreachService) {}

  @Public()
  @SkipVersionCheck()
  @Get('unsubscribe/:token')
  @ApiExcludeEndpoint()
  async outreachUnsubscribe(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const ok = await this.outreach.unsubscribe(token);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res
      .status(ok ? 200 : 404)
      .send(
        ok
          ? PAGE(
              'You are unsubscribed',
              'LawBid will not email you again. Sorry for the interruption.',
            )
          : PAGE(
              'Link not found',
              'This unsubscribe link is unknown or already used.',
            ),
      );
  }

  /**
   * Owner 2026-10-05 (legal): RFC 8058 one-click unsubscribe — mail
   * clients POST `List-Unsubscribe=One-Click` to the List-Unsubscribe
   * URL; any 2xx means done. Same handler, no page.
   */
  @Public()
  @SkipVersionCheck()
  @Post('unsubscribe/:token')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async outreachUnsubscribeOneClick(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const ok = await this.outreach.unsubscribe(token);
    res.setHeader('Cache-Control', 'no-store');
    res.status(ok ? 200 : 404).send(ok ? 'unsubscribed' : 'not found');
  }
}
