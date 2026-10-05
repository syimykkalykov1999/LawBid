import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
  COMMON_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { DeviceInfo, RequestMeta } from '../auth/services/session.service';
import {
  CreateDemoAccountDto,
  DemoAccountIdParamDto,
  DemoCurrentDto,
  DemoMeDto,
  DemoSessionDto,
  RedeemDemoInviteDto,
} from './demo.dto';
import { DemoService } from './demo.service';

const E = ErrorCode;

/** Owner 2026-10-05 («Продвижение»): a partner's demo accounts and the
 * blogger's code entry. */
@ApiTags('demo')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Get('me')
  @ApiOperation({ summary: 'My demo accounts and whether I may create one' })
  @ApiEnvelopeResponse(DemoMeDto)
  getDemoMe(@CurrentUser() user: RequestUser): Promise<DemoMeDto> {
    return this.demo.me(user.sub);
  }

  @Post('accounts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a demo account of a role and get its session',
  })
  @ApiEnvelopeResponse(DemoSessionDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.DEMO_DISABLED],
    409: [E.DEMO_LIMIT_REACHED],
    503: [E.DEMO_UNAVAILABLE],
  })
  createDemoAccount(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateDemoAccountDto,
    @Req() req: Request,
  ): Promise<DemoSessionDto> {
    return this.demo.create(user.sub, dto, device(req), meta(req));
  }

  @Post('accounts/:id/session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enter one of my demo accounts again' })
  @ApiEnvelopeResponse(DemoSessionDto)
  @ApiErrors({
    403: [E.DEMO_DISABLED],
    404: [E.NOT_FOUND],
    503: [E.DEMO_UNAVAILABLE],
  })
  enterDemoAccount(
    @CurrentUser() user: RequestUser,
    @Param() p: DemoAccountIdParamDto,
    @Req() req: Request,
  ): Promise<DemoSessionDto> {
    return this.demo.enter(user.sub, p.id, device(req), meta(req));
  }

  @Delete('accounts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete one of my demo accounts and its data' })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  deleteDemoAccount(
    @CurrentUser() user: RequestUser,
    @Param() p: DemoAccountIdParamDto,
  ): Promise<void> {
    return this.demo.remove(user.sub, p.id);
  }

  @Public()
  @Post('invites/redeem')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enter a demo account with the code the LawBid team handed out',
  })
  @ApiEnvelopeResponse(DemoSessionDto)
  @ApiErrors({
    ...COMMON_ERRORS,
    403: [E.DEMO_DISABLED],
    404: [E.DEMO_CODE_INVALID],
    503: [E.DEMO_UNAVAILABLE],
  })
  redeemDemoInvite(
    @Body() dto: RedeemDemoInviteDto,
    @Req() req: Request,
  ): Promise<DemoSessionDto> {
    return this.demo.redeem(dto.code, device(req), meta(req));
  }

  @Get('session')
  @ApiOperation({
    summary: 'The demo account I am in right now (demo session only)',
  })
  @ApiEnvelopeResponse(DemoCurrentDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  getDemoSession(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<DemoCurrentDto> {
    const lang = (req.header('accept-language') ?? '').toLowerCase();
    return this.demo.current(user.sub, lang.startsWith('ru') ? 'ru' : 'en');
  }
}

function device(req: Request): DeviceInfo {
  const id = req.header('x-device-id')?.trim();
  return {
    deviceId: id && id.length <= 255 ? id : undefined,
    platform: req.header('x-platform')?.trim().slice(0, 32) || undefined,
    appVersion: req.header('x-app-version')?.trim().slice(0, 32) || undefined,
  };
}

function meta(req: Request): RequestMeta {
  const deviceId = req.header('x-device-id')?.trim();
  return {
    ip: req.ip,
    userAgent: req.header('user-agent'),
    deviceId: deviceId && deviceId.length <= 255 ? deviceId : undefined,
  };
}
