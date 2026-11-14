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

const PAGE = (title: string, text: string, extra = '') =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<title>${title}</title></head><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0B0B0D;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">` +
  `<div style="max-width:420px;padding:32px;text-align:center"><h1 style="color:#C9A24A;font-size:22px">${title}</h1><p style="opacity:.8">${text}</p>${extra}</div></body></html>`;

/** CAN-SPAM unsubscribe link printed in every cold email; opened in a
 * browser, so no app version header and no sign-in. */
@ApiTags('outreach')
@Controller('outreach')
export class OutreachController {
  constructor(private readonly outreach: OutreachService) {}

  /**
   * Detective R2B-14 (14.11): opening the link only SHOWS a confirm page —
   * mail scanners and link previews open every URL in a message, so a GET
   * must never unsubscribe (Mailchimp, RFC 8058 §1). The button POSTs.
   */
  @Public()
  @SkipVersionCheck()
  @Get('unsubscribe/:token')
  @ApiExcludeEndpoint()
  outreachUnsubscribe(
    @Param('token') token: string,
    @Res() res: Response,
  ): void {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!/^[A-Za-z0-9_-]{16,48}$/.test(token)) {
      res
        .status(404)
        .send(
          PAGE(
            'Link not found',
            'This unsubscribe link is unknown or already used.',
          ),
        );
      return;
    }
    res
      .status(200)
      .send(
        PAGE(
          'Unsubscribe from LawBid emails?',
          'Tap the button and LawBid will not email you again.',
          `<form method="post" action="/api/v1/outreach/unsubscribe/${token}"><button type="submit" style="margin-top:12px;padding:12px 20px;border:0;border-radius:10px;background:#C9A24A;color:#0B0B0D;font-size:16px;font-weight:600">Unsubscribe</button></form>`,
        ),
      );
  }

  /**
   * Owner 2026-10-05 (legal): RFC 8058 one-click unsubscribe — mail
   * clients POST `List-Unsubscribe=One-Click` to the List-Unsubscribe
   * URL; any 2xx means done. The confirm page's button posts here too, so
   * the answer is the page.
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
}
