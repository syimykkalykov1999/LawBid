import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { conditionalGet, weakEtag } from '../../common/sync/cheap-etag';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { assertHotlineOn } from './hotline-access';
import {
  HotlineAcceptingDto,
  HotlineCallBackDto,
  HotlineConfigDto,
  HotlineDisclosureAckDto,
  HotlineDisclosureDto,
  HotlineCountersDto,
  HotlineEndDto,
  HotlineHeartbeatDto,
  HotlineLanguagesDto,
  HotlineLineDto,
  HotlineLineViewDto,
  HotlineClaimDto,
  HotlineNotifyMeDto,
  HotlineOfferCaseDto,
  HotlineOfferCaseResultDto,
  HotlineOfferResultDto,
  HotlineOkDto,
  HotlineRequestDto,
  HotlineRequestViewDto,
  HotlineReviewDto,
} from './hotline.dto';
import { HotlineService } from './hotline.service';

const OFF = { 403: [ErrorCode.FEATURE_DISABLED, ErrorCode.FORBIDDEN] };

/** Owner row 87: the call hotline (attorney: the line and offers; client:
 * the request, «Сообщите мне», «Позвонить сейчас»). Off by default. */
@ApiTags('hotline')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('hotline')
export class HotlineController {
  constructor(private readonly hotline: HotlineService) {}

  @Get('config')
  @ApiOperation({ summary: 'Hotline switches and numbers for the app' })
  @ApiEnvelopeResponse(HotlineConfigDto)
  hotlineConfig(@CurrentUser() user: RequestUser): Promise<HotlineConfigDto> {
    return this.hotline.config(user);
  }

  // ── attorney ──

  @Put('line')
  @ApiOperation({ summary: '«Ожидать звонки»: on the line with these filters' })
  @ApiEnvelopeResponse(HotlineLineViewDto)
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    403: [
      ErrorCode.FEATURE_DISABLED,
      ErrorCode.FORBIDDEN,
      ErrorCode.ATTORNEY_NOT_VERIFIED,
      ErrorCode.ENTITLEMENT_REQUIRED,
    ],
  })
  hotlineLineOn(
    @CurrentUser() user: RequestUser,
    @Body() dto: HotlineLineDto,
  ): Promise<HotlineLineViewDto> {
    return this.hotline.goOnline(user, dto);
  }

  @Post('line/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Back on the line after a reconnect with the kept choice (screen still open)',
  })
  @ApiEnvelopeResponse(HotlineLineViewDto)
  @ApiErrors({
    403: [
      ErrorCode.FEATURE_DISABLED,
      ErrorCode.FORBIDDEN,
      ErrorCode.ATTORNEY_NOT_VERIFIED,
      ErrorCode.ENTITLEMENT_REQUIRED,
    ],
  })
  hotlineLineResume(
    @CurrentUser() user: RequestUser,
  ): Promise<HotlineLineViewDto> {
    return this.hotline.resumeLine(user);
  }

  @Post('disclosure/ack')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '«Понятно» under the one-time disclosure' })
  @ApiEnvelopeResponse(HotlineDisclosureDto)
  hotlineDisclosureAck(
    @CurrentUser() user: RequestUser,
    @Body() dto: HotlineDisclosureAckDto,
  ): Promise<HotlineDisclosureDto> {
    return this.hotline.ackDisclosure(user, dto?.version);
  }

  @Delete('line')
  @ApiOperation({ summary: '«Выключить линию»' })
  @ApiEnvelopeResponse(HotlineLineViewDto)
  @ApiErrors({ 403: [ErrorCode.FORBIDDEN] })
  hotlineLineOff(
    @CurrentUser() user: RequestUser,
  ): Promise<HotlineLineViewDto> {
    return this.hotline.goOfflineByUser(user);
  }

  @Post('line/accepting')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '«Принимать звонки» on / off (⋯ menu in a call)' })
  @ApiEnvelopeResponse(HotlineLineViewDto)
  @ApiErrors(OFF)
  hotlineSetAccepting(
    @CurrentUser() user: RequestUser,
    @Body() dto: HotlineAcceptingDto,
  ): Promise<HotlineLineViewDto> {
    return this.hotline.setAccepting(user, dto.accepting);
  }

  @Post('heartbeat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'REST fallback of the socket `hotline:heartbeat` (screen open)',
  })
  @ApiEnvelopeResponse(HotlineHeartbeatDto)
  @ApiErrors(OFF)
  async hotlineHeartbeat(
    @CurrentUser() user: RequestUser,
  ): Promise<HotlineHeartbeatDto> {
    await assertHotlineOn({
      isEnabled: () => this.hotline.enabled(),
    });
    const res = await this.hotline.heartbeat(user.sub);
    return {
      ok: res.line !== false,
      seconds: 0,
      ...(res.waiting !== undefined ? { waiting: res.waiting } : {}),
    };
  }

  @Post('offers/:id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '«Взять» (idempotent); billing starts here' })
  @ApiEnvelopeResponse(HotlineOfferResultDto)
  @ApiErrors(OFF)
  hotlineAcceptOffer(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<HotlineOfferResultDto> {
    return this.hotline.accept(user, id);
  }

  @Post('offers/:id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '«Пропустить»: the call goes to the next attorney' })
  @ApiEnvelopeResponse(HotlineOfferResultDto)
  @ApiErrors(OFF)
  async hotlineDeclineOffer(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<HotlineOfferResultDto> {
    const res = await this.hotline.decline(user, id);
    return { ok: res.ok, state: res.ok ? 'skipped' : 'gone' };
  }

  @Post('calls/:id/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End a hotline call (either side, idempotent)' })
  @ApiEnvelopeResponse(HotlineEndDto)
  @ApiErrors({ 404: [ErrorCode.NOT_FOUND] })
  hotlineEndCall(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<HotlineEndDto> {
    return this.hotline.endCall(id, 'ended', user.sub);
  }

  // ── client ──

  @Post('requests')
  @ApiOperation({
    summary: '«Связаться с адвокатом» (one active request per client)',
  })
  @ApiEnvelopeResponse(HotlineRequestViewDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    403: [ErrorCode.FEATURE_DISABLED, ErrorCode.FORBIDDEN],
    429: [ErrorCode.RATE_LIMITED],
  })
  hotlineCreateRequest(
    @CurrentUser() user: RequestUser,
    @Body() dto: HotlineRequestDto,
  ): Promise<HotlineRequestViewDto> {
    return this.hotline.createRequest(user, dto);
  }

  @Post('call-back')
  @ApiOperation({
    summary:
      '«Перезвонить»: the client calls the same attorney again (only the client)',
  })
  @ApiEnvelopeResponse(HotlineRequestViewDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    403: [ErrorCode.FEATURE_DISABLED, ErrorCode.FORBIDDEN],
    429: [ErrorCode.RATE_LIMITED],
  })
  hotlineCallBack(
    @CurrentUser() user: RequestUser,
    @Body() dto: HotlineCallBackDto,
  ): Promise<HotlineRequestViewDto> {
    return this.hotline.callBack(user, dto);
  }

  @Get('requests/:id')
  @ApiOperation({ summary: 'My request (ETag / 304 for polling)' })
  @ApiEnvelopeResponse(HotlineRequestViewDto)
  @ApiErrors({ 404: [ErrorCode.NOT_FOUND] })
  async hotlineGetRequest(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<HotlineRequestViewDto | undefined> {
    await this.cacheFor(res);
    const tag = await this.hotline.requestTag(user, id);
    return conditionalGet(
      req,
      res,
      tag ? weakEtag('hl', id, tag) : null,
      () => Promise.resolve(),
      () => this.hotline.getRequest(user, id),
    );
  }

  @Delete('requests/:id')
  @ApiOperation({ summary: '«Выйти из очереди» / cancel' })
  @ApiEnvelopeResponse(HotlineRequestViewDto)
  @ApiErrors({ 404: [ErrorCode.NOT_FOUND] })
  hotlineCancelRequest(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<HotlineRequestViewDto> {
    return this.hotline.cancelRequest(user, id);
  }

  @Patch('requests/:id')
  @ApiOperation({ summary: '«Поменять язык» while waiting (keeps the place)' })
  @ApiEnvelopeResponse(HotlineRequestViewDto)
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR], 404: [ErrorCode.NOT_FOUND] })
  hotlineChangeLanguages(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HotlineLanguagesDto,
  ): Promise<HotlineRequestViewDto> {
    return this.hotline.changeLanguages(user, id, dto.languages);
  }

  @Post('requests/:id/notify-me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '«Сообщите, когда появится адвокат»: leave, keep the place',
  })
  @ApiEnvelopeResponse(HotlineRequestViewDto)
  @ApiErrors({ 404: [ErrorCode.NOT_FOUND] })
  hotlineNotifyMe(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HotlineNotifyMeDto,
  ): Promise<HotlineRequestViewDto> {
    return this.hotline.notifyMe(
      user,
      id,
      dto.timeZone,
      dto.allowNight === true,
    );
  }

  @Post('requests/:id/offer-case')
  @ApiOperation({
    summary:
      '«Предложить дело»: our case from the call, offered to its attorney (one per call)',
  })
  @ApiEnvelopeResponse(HotlineOfferCaseResultDto, {
    status: HttpStatus.CREATED,
  })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR, ErrorCode.CASE_CONTAINS_CONTACT_INFO],
    403: [
      ErrorCode.FEATURE_DISABLED,
      ErrorCode.FORBIDDEN,
      ErrorCode.CLIENT_CONTACTS_INCOMPLETE,
      ErrorCode.ONBOARDING_INCOMPLETE,
      ErrorCode.CLIENT_CONTACT_SHARING_CONSENT_REQUIRED,
      ErrorCode.COUNTRY_NOT_AVAILABLE,
      ErrorCode.LEGAL_REACCEPT_REQUIRED,
    ],
    404: [ErrorCode.NOT_FOUND],
    409: [
      ErrorCode.INVITE_ATTORNEY_UNAVAILABLE,
      ErrorCode.CASE_INVALID_STATE,
      ErrorCode.BID_ALREADY_EXISTS,
    ],
    429: [ErrorCode.RATE_LIMITED],
  })
  hotlineOfferCase(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HotlineOfferCaseDto,
    @Req() req: Request,
  ): Promise<HotlineOfferCaseResultDto> {
    return this.hotline.offerCase(user, id, dto, {
      ip: req.ip,
      userAgent: req.header('user-agent'),
      deviceId: req.header('x-device-id'),
    });
  }

  @Post('requests/:id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '«Как прошёл разговор?» (client, first answer wins)',
  })
  @ApiEnvelopeResponse(HotlineOkDto)
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    403: [ErrorCode.FEATURE_DISABLED, ErrorCode.FORBIDDEN],
    404: [ErrorCode.NOT_FOUND],
  })
  hotlineReview(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HotlineReviewDto,
  ): Promise<HotlineOkDto> {
    return this.hotline.review(user, id, dto);
  }

  @Post('requests/:id/claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '«Позвонить сейчас»: online again with the original time',
  })
  @ApiEnvelopeResponse(HotlineRequestViewDto)
  @ApiBody({ type: HotlineClaimDto, required: false })
  @ApiErrors({ 403: [ErrorCode.FORBIDDEN], 404: [ErrorCode.NOT_FOUND] })
  hotlineClaim(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HotlineClaimDto,
  ): Promise<HotlineRequestViewDto> {
    return this.hotline.claim(user, id, dto?.token);
  }

  @Get('counters')
  @ApiOperation({
    summary: 'Banded «адвокатов / клиентов» of buckets (ETag / 304, 5 s)',
  })
  @ApiQuery({
    name: 'keys',
    description: 'Comma list: b:<state~practice~lang> or l:<lang> (≤ 20)',
  })
  @ApiEnvelopeResponse(HotlineCountersDto)
  @ApiErrors(OFF)
  async hotlineCounters(
    @Query('keys') keys: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<HotlineCountersDto | undefined> {
    await assertHotlineOn({ isEnabled: () => this.hotline.enabled() });
    await this.cacheFor(res);
    const map = await this.hotline.counters(String(keys ?? '').split(','));
    const items = Object.entries(map).map(([key, v]) => ({ key, ...v }));
    const tag = weakEtag(
      'hlc',
      ...items.map((i) => `${i.key}=${i.lawyers}/${i.clients}`),
    );
    return conditionalGet(
      req,
      res,
      tag,
      () => Promise.resolve(),
      () => Promise.resolve({ items }),
    );
  }

  /** `hotline.poll_cache_sec` (audit 17.11 #8: was 5 s in code). */
  private async cacheFor(res: Response): Promise<void> {
    const { s } = await this.hotline.cfg();
    const sec = s['hotline.poll_cache_sec'];
    res.setHeader(
      'Cache-Control',
      sec > 0 ? `private, max-age=${sec}` : 'private, no-cache',
    );
  }
}
