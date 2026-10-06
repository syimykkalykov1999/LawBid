import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode as E } from '../../common/errors/error-code.enum';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { DmcaService } from './dmca.service';
import {
  CreateDmcaNoticeDto,
  DmcaAgentDto,
  DmcaCounterNoticeDto,
  DmcaMineDto,
  DmcaNoticeBriefDto,
  DmcaNoticeCreatedDto,
  DmcaNoticeIdParamDto,
  LegalPublicDto,
} from './legal.dto';
import { LegalService } from './legal.service';

/** Owner 2026-10-05 (legal): the app's legal texts, the DMCA agent and
 * DMCA notices filed from the app. */
@ApiTags('legal')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('legal')
export class LegalController {
  constructor(
    private readonly legal: LegalService,
    private readonly dmca: DmcaService,
  ) {}

  @Get('settings')
  @ApiOperation({
    summary:
      'Legal texts in my language (case form, unverified attorney, support, partner disclosure and rules), the DMCA agent and the partner rules version',
  })
  @ApiEnvelopeResponse(LegalPublicDto)
  getLegalSettings(@CurrentUser() user: RequestUser): Promise<LegalPublicDto> {
    return this.legal.publicSettings(user.sub);
  }

  @Public()
  @Get('dmca-agent')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({
    summary:
      'The designated DMCA agent (public, for the website; empty until registered)',
  })
  @ApiEnvelopeResponse(DmcaAgentDto)
  getDmcaAgent(): Promise<DmcaAgentDto> {
    return this.legal.dmcaAgent();
  }

  @Post('dmca')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'File a DMCA takedown notice (a target on LawBid or a URL); with a target a `copyright` report is filed too',
  })
  @ApiEnvelopeResponse(DmcaNoticeCreatedDto, { status: HttpStatus.CREATED })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 429: [E.RATE_LIMITED] })
  createDmcaNotice(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateDmcaNoticeDto,
  ): Promise<DmcaNoticeCreatedDto> {
    return this.dmca.create(user.sub, dto);
  }

  @Get('dmca/mine')
  @ApiOperation({
    summary: 'My DMCA notices and the notices against my content',
  })
  @ApiEnvelopeResponse(DmcaMineDto)
  getMyDmcaNotices(@CurrentUser() user: RequestUser): Promise<DmcaMineDto> {
    return this.dmca.mine(user.sub);
  }

  @Post('dmca/:id/counter')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'File a counter-notice (17 U.S.C. §512(g)) — only the author of the removed content',
  })
  @ApiEnvelopeResponse(DmcaNoticeBriefDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN],
    404: [E.NOT_FOUND],
    409: [E.DMCA_INVALID_STATE],
  })
  counterDmcaNotice(
    @CurrentUser() user: RequestUser,
    @Param() params: DmcaNoticeIdParamDto,
    @Body() dto: DmcaCounterNoticeDto,
  ): Promise<DmcaNoticeBriefDto> {
    return this.dmca.counter(user.sub, params.id, dto);
  }
}
