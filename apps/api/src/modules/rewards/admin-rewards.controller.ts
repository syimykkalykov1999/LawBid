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
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  CreateRewardAwardDto,
  RewardAwardDto,
  RewardAwardIdParamDto,
  RewardLeaderboardDto,
  RewardPeriodQueryDto,
  RewardsSettingsDto,
  UpdateRewardsSettingsDto,
} from './rewards.dto';
import { RewardsService } from './rewards.service';

const E = ErrorCode;

/** Owner 2026-10-05: Люди → Поощрения («Лучший сотрудник»). Only the
 * owner (the trusted deputy reads). Switched off, the leaderboard and
 * prizes answer 404 and staff see nothing. */
@ApiTags('admin-rewards')
@AdminEndpoint('super_admin')
@Controller('admin/rewards')
export class AdminRewardsController {
  constructor(private readonly rewards: RewardsService) {}

  @Get('settings')
  @ApiOperation({
    summary: 'Master switch, period, prize and bonus per department',
  })
  @ApiEnvelopeResponse(RewardsSettingsDto)
  getRewardsSettings(): Promise<RewardsSettingsDto> {
    return this.rewards.getSettings();
  }

  @Put('settings')
  @ApiOperation({ summary: 'Switch rewards on/off, period, prizes, bonuses' })
  @ApiEnvelopeResponse(RewardsSettingsDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  updateRewardsSettings(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: UpdateRewardsSettingsDto,
  ): Promise<RewardsSettingsDto> {
    return this.rewards.updateSettings(admin.id, dto);
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Best employees per department for a period' })
  @ApiEnvelopeResponse(RewardLeaderboardDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  getRewardsLeaderboard(
    @Query() q: RewardPeriodQueryDto,
  ): Promise<RewardLeaderboardDto> {
    return this.rewards.leaderboard(q.period);
  }

  @Get('awards')
  @ApiOperation({ summary: 'Prizes given (latest first)' })
  @ApiEnvelopeResponse(RewardAwardDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  listRewardAwards(
    @Query() q: RewardPeriodQueryDto,
  ): Promise<RewardAwardDto[]> {
    return this.rewards.awards(q.period);
  }

  @Post('awards')
  @ApiOperation({
    summary: 'Give a prize; a bonus goes to Зарплаты as an accrual',
  })
  @ApiEnvelopeResponse(RewardAwardDto, { status: HttpStatus.CREATED })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  createRewardAward(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: CreateRewardAwardDto,
  ): Promise<RewardAwardDto> {
    return this.rewards.give(admin.id, dto);
  }

  @Delete('awards/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Take a prize back (an unpaid bonus is canceled)' })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  async deleteRewardAward(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: RewardAwardIdParamDto,
  ): Promise<void> {
    await this.rewards.revoke(admin.id, p.id);
  }
}
