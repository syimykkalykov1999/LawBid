import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  Roles,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  AdminCreateDemoAccountDto,
  AdminDemoAccountCreatedDto,
  AdminDemoAccountsPageDto,
  AdminDemoAccountsQueryDto,
  AdminDemoInviteDto,
  DemoAccountIdParamDto,
  DemoSettingsDto,
  DemoStatusDto,
} from './demo.dto';
import { DemoService } from './demo.service';
import type { DemoProgramSettings } from './demo.settings';

const E = ErrorCode;

/** Owner 2026-10-05: Деньги → Партнёры → «Демо-доступ». */
@ApiTags('admin-demo')
@AdminEndpoint('super_admin', 'finance', 'support')
@Controller('admin/demo')
export class AdminDemoController {
  constructor(private readonly demo: DemoService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Demo mode settings' })
  @ApiEnvelopeResponse(DemoSettingsDto)
  getDemoSettings(): Promise<DemoProgramSettings> {
    return this.demo.settings();
  }

  @Roles('super_admin', 'finance')
  @Put('settings')
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Change demo mode settings' })
  @ApiEnvelopeResponse(DemoSettingsDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  updateDemoSettings(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: DemoSettingsDto,
  ): Promise<DemoProgramSettings> {
    return this.demo.updateSettings(admin, dto);
  }

  @Get('status')
  @ApiOperation({ summary: 'Is the demo world ready; counts; last reset' })
  @ApiEnvelopeResponse(DemoStatusDto)
  getDemoStatus(): Promise<DemoStatusDto> {
    return this.demo.status();
  }

  @Get('accounts')
  @ApiOperation({ summary: 'Demo accounts: who created them, last use' })
  @ApiEnvelopeResponse(AdminDemoAccountsPageDto)
  listDemoAccounts(
    @Query() q: AdminDemoAccountsQueryDto,
  ): Promise<AdminDemoAccountsPageDto> {
    return this.demo.adminList(q);
  }

  @Roles('super_admin', 'finance')
  @Post('accounts')
  @SkipAutoAudit()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a demo account for a blogger (code shown once)',
  })
  @ApiEnvelopeResponse(AdminDemoAccountCreatedDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 503: [E.DEMO_UNAVAILABLE] })
  createDemoAccountForBlogger(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: AdminCreateDemoAccountDto,
  ): Promise<AdminDemoAccountCreatedDto> {
    return this.demo.adminCreate(admin, dto);
  }

  @Roles('super_admin', 'finance')
  @Post('accounts/:id/invite')
  @SkipAutoAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'New entry code (the old one stops working)' })
  @ApiEnvelopeResponse(AdminDemoInviteDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  mintDemoInvite(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: DemoAccountIdParamDto,
  ): Promise<AdminDemoInviteDto> {
    return this.demo.adminInvite(admin, p.id);
  }

  @Roles('super_admin', 'finance')
  @Delete('accounts/:id')
  @SkipAutoAudit()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a demo account and its data' })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  deleteDemoAccountAsAdmin(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: DemoAccountIdParamDto,
  ): Promise<void> {
    return this.demo.adminRemove(admin, p.id);
  }

  @Roles('super_admin')
  @Post('reset')
  @SkipAutoAudit()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Wipe the demo world and seed it again (deletes all demo accounts)',
  })
  @ApiErrors({ 503: [E.DEMO_UNAVAILABLE] })
  resetDemoWorld(@CurrentAdmin() admin: AdminActor): Promise<void> {
    return this.demo.adminReset(admin);
  }
}
