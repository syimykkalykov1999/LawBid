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
  NewCaseAlertsDto,
  NotificationDto,
  IconBadgeDto,
  NotificationSettingsDto,
  NotificationsQueryDto,
  PushTokenDto,
  ArmedRemindersDto,
  VoipTokenDto,
  QuietHoursDto,
  TimezoneDto,
  ReadNotificationsDto,
  ReadNotificationsResultDto,
  UpdateNewCaseAlertsDto,
  UpdateNotificationSettingsDto,
  UpdateTopicSettingsDto,
} from './notifications-api.dto';
import { NotificationsApiService } from './notifications-api.service';
import { PushTokensService } from './push/push-tokens.service';
import { VoipTokensService } from './push/voip-tokens.service';
import { AssistantSelf } from '../auth/assistant/assistant-context';

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
    private readonly voipTokens: VoipTokensService,
  ) {}

  // OQ-048: an assistant has their own notifications and devices.
  @AssistantSelf()
  @Get('notifications')
  @ApiOperation({ summary: 'Notifications, newest first (§9.1)' })
  @ApiEnvelopeResponse(NotificationDto, { isArray: true })
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  listNotifications(
    @CurrentUser() user: RequestUser,
    @Query() q: NotificationsQueryDto,
  ) {
    return this.api.list(user.sub, q.cursor, q.group, q.q, q.updatedSince);
  }

  // OQ-048: an assistant has their own notifications and devices.
  @AssistantSelf()
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
  async getBadges(@CurrentUser() user: RequestUser): Promise<Badges> {
    // Owner 2026-10-21: the icon switch is the device owner's own.
    const me = user.assistant?.userId ?? user.sub;
    return this.badges.withIcon(
      me,
      user.assistant
        ? await this.badges.forAssistant(user.sub, user.assistant.userId)
        : await this.badges.get(user.sub),
    );
  }

  // OQ-048: an assistant has their own notifications and devices.
  @AssistantSelf()
  @Get('notification-settings')
  @ApiOperation({ summary: 'Push/email per category + quiet hours (§9.5)' })
  @ApiEnvelopeResponse(NotificationSettingsDto)
  getNotificationSettings(@CurrentUser() user: RequestUser) {
    return this.api.settings(user.sub);
  }

  // OQ-048: an assistant has their own notifications and devices.
  @AssistantSelf()
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

  // Owner 2026-10-01: which qualifications send "new case" alerts (the
  // attorney's account; an assistant sees and sets the attorney's).
  @Get('notification-settings/new-cases')
  @ApiOperation({ summary: 'Qualifications for new-case alerts' })
  @ApiEnvelopeResponse(NewCaseAlertsDto)
  @ApiErrors({ 403: [ErrorCode.FORBIDDEN] })
  getNewCaseAlerts(@CurrentUser() user: RequestUser) {
    return this.api.newCaseAlerts(user.sub);
  }

  @Put('notification-settings/new-cases')
  @ApiOperation({
    summary: "New-case alerts: the profile's qualifications or a chosen list",
  })
  @ApiEnvelopeResponse(NewCaseAlertsDto)
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR], 403: [ErrorCode.FORBIDDEN] })
  setNewCaseAlerts(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateNewCaseAlertsDto,
  ) {
    return this.api.setNewCaseAlerts(user.sub, dto);
  }

  // Owner 2026-10-20: the app sends the phone's time zone at sign-in and
  // when it changes; repeating tasks and daily reminders follow it.
  @AssistantSelf()
  @Put('me/timezone')
  @HttpCode(204)
  @ApiOperation({ summary: "Set the person's IANA time zone" })
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  async setTimezone(
    @CurrentUser() user: RequestUser,
    @Body() dto: TimezoneDto,
  ): Promise<void> {
    await this.api.setTimezone(user.sub, dto.timezone);
  }

  // OQ-048: an assistant has their own notifications and devices.
  @AssistantSelf()
  @Put('notification-settings/quiet-hours')
  @ApiOperation({ summary: 'Quiet hours; start: null clears (§9.5)' })
  @ApiEnvelopeResponse(NotificationSettingsDto)
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  setQuietHours(@CurrentUser() user: RequestUser, @Body() dto: QuietHoursDto) {
    return this.api.setQuietHours(user.sub, dto);
  }

  // Owner 2026-10-21 (inbox 30): a switch per kind of notification.
  @AssistantSelf()
  @Put('notification-settings/topics')
  @ApiOperation({ summary: 'Kinds of notifications on/off; locked stay on' })
  @ApiEnvelopeResponse(NotificationSettingsDto)
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  updateNotificationTopics(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateTopicSettingsDto,
  ) {
    return this.api.updateTopics(user.sub, dto.items);
  }

  // Owner 2026-10-21 (inbox 29): «Счётчик на иконке в меню».
  @AssistantSelf()
  @Put('notification-settings/icon-badge')
  @ApiOperation({ summary: 'Unread number on the app icon on/off' })
  @ApiEnvelopeResponse(NotificationSettingsDto)
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  setIconBadge(@CurrentUser() user: RequestUser, @Body() dto: IconBadgeDto) {
    return this.api.setIconBadge(user.sub, dto.enabled);
  }

  // OQ-048: an assistant has their own notifications and devices.
  @AssistantSelf()
  @Post('push-tokens')
  @HttpCode(204)
  @ApiOperation({ summary: 'Register this device for push (§9.5)' })
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  async registerPushToken(
    @CurrentUser() user: RequestUser,
    @Body() dto: PushTokenDto,
  ): Promise<void> {
    await this.tokens.register(
      user.sub,
      user.sid,
      dto.token,
      dto.platform,
      dto.localReminders === true && dto.platform === 'android',
      dto.chatStyle === true && dto.platform === 'android',
      dto.actorStyle === true && dto.platform === 'android',
    );
  }

  // Owner 2026-10-20: an iPhone reports the reminders it armed locally.
  @AssistantSelf()
  @Put('push-tokens/armed')
  @HttpCode(204)
  @ApiOperation({ summary: 'Planner reminders this device keeps as alarms' })
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  async setArmedReminders(
    @CurrentUser() user: RequestUser,
    @Body() dto: ArmedRemindersDto,
  ): Promise<void> {
    await this.tokens.setArmedReminders(user.sub, dto.token, dto.ids);
  }

  // Owner 2026-10-17: an iPhone registers its PushKit token for calls.
  @AssistantSelf()
  @Post('push-tokens/voip')
  @HttpCode(204)
  @ApiOperation({ summary: 'Register this iPhone for call (VoIP) pushes' })
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  async registerVoipToken(
    @CurrentUser() user: RequestUser,
    @Body() dto: VoipTokenDto,
  ): Promise<void> {
    await this.voipTokens.register(
      user.sub,
      user.sid,
      dto.token,
      `${dto.bundleId}.voip`,
      dto.environment,
    );
  }

  @AssistantSelf()
  @Delete('push-tokens/voip')
  @HttpCode(204)
  @ApiOperation({ summary: 'Stop call (VoIP) pushes to this iPhone' })
  async deleteVoipToken(
    @CurrentUser() user: RequestUser,
    @Body() dto: DeletePushTokenDto,
  ): Promise<void> {
    await this.voipTokens.unregister(user.sub, dto.token);
  }

  // OQ-048: an assistant has their own notifications and devices.
  @AssistantSelf()
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
