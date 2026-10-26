import { Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { SkipVersionCheck } from '../feature-flags/decorators/skip-version-check.decorator';
import { DeletionNoticesService } from './deletion-notices.service';

const esc = (v: string): string =>
  v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const PAGE = (title: string, text: string, form = ''): string =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<meta name="robots" content="noindex"><title>${title}</title></head>` +
  `<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0B0B0D;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">` +
  `<div style="max-width:420px;padding:32px;text-align:center"><h1 style="color:#C9A24A;font-size:22px">${title}</h1><p style="opacity:.8">${text}</p>${form}</div></body></html>`;

/**
 * Owner 2026-10-25 (S13-14): the cancel link of the deletion e-mails. Opened
 * in a browser, so no sign-in and no app version header. GET only shows a
 * button (mail scanners and link previewers open links: a GET must never
 * cancel an erasure request by itself); the button POSTs to the same
 * address and that call cancels.
 */
@ApiTags('privacy')
@Controller('privacy/deletion')
export class DeletionCancelController {
  constructor(private readonly notices: DeletionNoticesService) {}

  @Public()
  @SkipVersionCheck()
  @Get('cancel/:token')
  @ApiExcludeEndpoint()
  page(@Param('token') token: string, @Res() res: Response): void {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!this.notices.verify(token)) {
      res
        .status(404)
        .send(
          PAGE(
            'Link not valid',
            'This link is invalid or has expired. If your account is still scheduled for deletion, open LawBid and cancel it in Settings.',
          ),
        );
      return;
    }
    res
      .status(200)
      .send(
        PAGE(
          'Keep your LawBid account?',
          'Your account is scheduled for deletion. Tap the button to cancel the deletion and keep it.',
          `<form method="post" action="${esc(`/api/v1/privacy/deletion/cancel/${token}`)}"><button type="submit" style="margin-top:12px;padding:12px 20px;border:0;border-radius:10px;background:#C9A24A;color:#0B0B0D;font-size:16px;font-weight:600">Keep my account</button></form>`,
        ),
      );
  }

  @Public()
  @SkipVersionCheck()
  @Post('cancel/:token')
  @ApiExcludeEndpoint()
  async cancel(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ok = await this.notices.cancelByToken(token, {
      ip: req.ip,
      userAgent: req.header('user-agent'),
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res
      .status(ok ? 200 : 404)
      .send(
        ok
          ? PAGE(
              'Deletion cancelled',
              'Your account stays. You can sign in as usual.',
            )
          : PAGE(
              'Nothing to cancel',
              'The deletion was already cancelled or completed, or the link has expired.',
            ),
      );
  }
}
