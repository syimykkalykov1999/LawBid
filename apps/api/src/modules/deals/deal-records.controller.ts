import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiHeader,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { SkipVersionCheck } from '../feature-flags/decorators/skip-version-check.decorator';
import { verifyPage } from './deal-record.verify';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import {
  AdminEndpoint,
  SkipAutoAudit,
} from '../admin-auth/admin-auth.decorators';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import type { RequestMeta } from '../auth/services/session.service';
import { DealRecordsService } from './deal-records.service';
import { DealRecordPreview } from './deal-record.preview';
import {
  AttachAgreementDto,
  CreateDealRecordDto,
  DealCaseIdParamDto,
  DealRecordDto,
  DealRecordIdParamDto,
  DealRecordLookupDto,
  DeclineDealRecordDto,
  SignDealRecordDto,
} from './dto/deal-record.dto';
import { RequiresDuty } from '../auth/assistant/assistant-context';

const E = ErrorCode;
const ERR = {
  400: [E.VALIDATION_ERROR],
  403: [E.ASSISTANT_NOT_ALLOWED, E.FORBIDDEN],
  404: [E.NOT_FOUND, E.CASE_NOT_FOUND],
  409: [
    E.DEAL_RECORD_PENDING,
    E.DEAL_RECORD_INVALID_STATE,
    E.CASE_INVALID_STATE,
    E.BID_INVALID_STATE,
    E.BID_NOT_YOUR_TURN,
    E.BID_ATTORNEY_INACTIVE,
  ],
};

function requestMeta(req: Request): RequestMeta {
  return {
    ip: req.ip,
    userAgent: req.header('user-agent'),
    deviceId: req.header('x-device-id'),
  };
}

/**
 * Deal record 2026-10-27 (docs/architecture/DEAL_RECORD_PLAN_2026-10-27.md
 * §4). Everything answers 404 while `deal_record.enabled` is off.
 */
@ApiTags('deal-records')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class DealRecordsController {
  constructor(private readonly deals: DealRecordsService) {}

  @RequiresDuty('cases')
  @Post('deal-records')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary:
      'Accept a bid through the deal record: creates the record (status preparing) and renders the PDF in the background. The bid is accepted only after both signatures.',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiEnvelopeResponse(DealRecordDto, { status: HttpStatus.CREATED })
  @ApiErrors(ERR)
  startDealRecord(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateDealRecordDto,
    @Req() req: Request,
  ): Promise<DealRecordDto> {
    return this.deals.start(user, dto, requestMeta(req));
  }

  @RequiresDuty('cases')
  @Get('deal-records/:id')
  @ApiOperation({ summary: 'A deal record (both parties)' })
  @ApiEnvelopeResponse(DealRecordDto)
  @ApiErrors(ERR)
  getDealRecord(
    @CurrentUser() user: RequestUser,
    @Param() p: DealRecordIdParamDto,
  ): Promise<DealRecordDto> {
    return this.deals.get(user, p.id);
  }

  @RequiresDuty('cases')
  @Get('cases/:id/deal-record')
  @ApiOperation({
    summary:
      "The case's current deal record (live, else the sealed one), or null — for the Docs tab card and the bid screen",
  })
  @ApiEnvelopeResponse(DealRecordLookupDto)
  @ApiErrors(ERR)
  async currentDealRecord(
    @CurrentUser() user: RequestUser,
    @Param() p: DealCaseIdParamDto,
  ): Promise<DealRecordLookupDto> {
    return { record: await this.deals.current(user, p.id) };
  }

  /** v2 (owner 2026-11-08): the page the PDF's QR opens. No sign-in, no
   * names or case content (masked parties, fingerprints, dates). */
  @Public()
  @SkipVersionCheck()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('deal-records/:id/verify')
  @ApiExcludeEndpoint()
  async verifyDealRecord(
    @Param('id') id: string,
    @Query('sha256') sha256: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const page = verifyPage(
      await this.deals.verifyView(id),
      typeof sha256 === 'string' ? sha256 : undefined,
    );
    res
      .status(page.status)
      .set('Content-Type', 'text/html; charset=utf-8')
      .set('Content-Security-Policy', page.csp)
      .set('Cache-Control', 'no-store')
      .set('Referrer-Policy', 'no-referrer')
      .set('X-Robots-Tag', 'noindex')
      .send(page.html);
  }

  @RequiresDuty('cases')
  @Post('deal-records/:id/sign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Draw-sign the record (the acceptor first, then the other party). The second signature accepts the bid for real and seals the record.',
  })
  @ApiEnvelopeResponse(DealRecordDto)
  @ApiErrors(ERR)
  signDealRecord(
    @CurrentUser() user: RequestUser,
    @Param() p: DealRecordIdParamDto,
    @Body() dto: SignDealRecordDto,
    @Req() req: Request,
  ): Promise<DealRecordDto> {
    return this.deals.sign(user, p.id, dto, requestMeta(req));
  }

  @RequiresDuty('cases')
  @Post('deal-records/:id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Either party declines before the second signature: nothing was accepted, the bid and the case stay as they were.',
  })
  @ApiEnvelopeResponse(DealRecordDto)
  @ApiErrors(ERR)
  declineDealRecord(
    @CurrentUser() user: RequestUser,
    @Param() p: DealRecordIdParamDto,
    @Body() dto: DeclineDealRecordDto,
  ): Promise<DealRecordDto> {
    return this.deals.decline(user, p.id, dto);
  }

  @RequiresDuty('cases')
  @Post('deal-records/:id/agreement')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'The attorney links their own agreement PDF (an uploaded case file) to the sealed record.',
  })
  @ApiEnvelopeResponse(DealRecordDto)
  @ApiErrors(ERR)
  attachAgreement(
    @CurrentUser() user: RequestUser,
    @Param() p: DealRecordIdParamDto,
    @Body() dto: AttachAgreementDto,
  ): Promise<DealRecordDto> {
    return this.deals.attachAgreement(user, p.id, dto);
  }
}

/** Admin «Запись о сделке»: a sample PDF with the current texts. */
@ApiTags('admin-deal-record')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/deal-record')
export class AdminDealRecordController {
  constructor(private readonly preview: DealRecordPreview) {}

  @Get('preview')
  @ApiOperation({
    summary:
      'A sample deal record PDF rendered with the texts as they are now (both signatures drawn as sample images)',
  })
  @ApiProduces('application/pdf')
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'deal-record-preview.pdf — a binary file, not the JSON envelope.',
    content: {
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
    },
  })
  async previewDealRecord(@Res() res: Response): Promise<void> {
    const pdf = await this.preview.sample();
    res
      .status(200)
      .set('Content-Type', 'application/pdf')
      .set('Cache-Control', 'no-store')
      .set('Content-Disposition', 'inline; filename="deal-record-preview.pdf"')
      .send(pdf);
  }
}
