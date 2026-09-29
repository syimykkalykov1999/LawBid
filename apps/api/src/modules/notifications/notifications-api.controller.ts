import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { BadgesService, type Badges } from './badges.service';
import {
  BadgesDto,
  DeletePushTokenDto,
  NotificationDto,
  NotificationSettingsDto,
  NotificationsQueryDto,
  PushTokenDto,
  QuietHoursDto,
  ReadNotificationsDto,
  ReadNotificationsResultDto,
  UpdateNotificationSettingsDto,
} from './notifications-api.dto';
import { NotificationsApiService } from './notifications-api.service';
import { PushTokensService } from './push/push-tokens.service';

/** docs/05 §15 "Уведомления и push" (stage 5.8). */
@ApiTags('notifications')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class NotificationsApiController {
  constructor(
    private readonly api: NotificationsApiService,
    private readonly badges: BadgesService,
    private readonly tokens: PushTokensService,
  ) {}

  @Get('notifications')
  @ApiOperation({ summary: 'Notifications, newest first (§9.1)' })
  @ApiEnvelopeResponse(NotificationDto, { isArray: true })
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  listNotifications(
    @CurrentUser() user: RequestUser,
    @Query() q: NotificationsQueryDto,
  ) {
    return this.api.list(user.sub, q.cursor);
  }

  @Post('notifications/read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark read: {ids} or {all: true} (§9.1)' })
  @ApiEnvelopeResponse(ReadNotificationsResultDto)
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  readNotifications(
    @CurrentUser() user: RequestUser,
    @Body() dto: ReadNotificationsDto,
  ) {
    return this.api.read(user.sub, dto);
  }

  @Get('badges')
  @ApiOperation({ summary: 'Unread chats + notifications (§10)' })
  @ApiEnvelopeResponse(BadgesDto)
  getBadges(@CurrentUser() user: RequestUser): Promise<Badges> {
    return this.badges.get(user.sub);
  }

  @Get('notification-settings')
  @ApiOperation({ summary: 'Push/email per category + quiet hours (§9.5)' })
  @ApiEnvelopeResponse(NotificationSettingsDto)
  getNotificationSettings(@CurrentUser() user: RequestUser) {
    return this.api.settings(user.sub);
  }

  @Put('notification-settings')
  @ApiOperation({ summary: 'Update categories; system stays on (§9.5)' })
  @ApiEnvelopeResponse(NotificationSettingsDto)
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  updateNotificationSettings(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.api.updateSettings(user.sub, dto.items);
  }

  @Put('notification-settings/quiet-hours')
  @ApiOperation({ summary: 'Quiet hours; start: null clears (§9.5)' })
  @ApiEnvelopeResponse(NotificationSettingsDto)
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  setQuietHours(@CurrentUser() user: RequestUser, @Body() dto: QuietHoursDto) {
    return this.api.setQuietHours(user.sub, dto);
  }

  @Post('push-tokens')
  @HttpCode(204)
  @ApiOperation({ summary: 'Register this device for push (§9.5)' })
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  async registerPushToken(
    @CurrentUser() user: RequestUser,
    @Body() dto: PushTokenDto,
  ): Promise<void> {
    await this.tokens.register(user.sub, user.sid, dto.token, dto.platform);
  }

  @Delete('push-tokens')
  @HttpCode(204)
  @ApiOperation({ summary: 'Unregister a device (sign-out) (§9.5)' })
  async deletePushToken(
    @CurrentUser() user: RequestUser,
    @Body() dto: DeletePushTokenDto,
  ): Promise<void> {
    await this.tokens.unregister(user.sub, dto.token);
  }
}
