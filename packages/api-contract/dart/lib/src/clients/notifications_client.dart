// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/armed_reminders_dto.dart';
import '../models/badges_envelope.dart';
import '../models/delete_push_token_dto.dart';
import '../models/icon_badge_dto.dart';
import '../models/new_case_alerts_envelope.dart';
import '../models/notification_group.dart';
import '../models/notification_list_envelope.dart';
import '../models/notification_settings_envelope.dart';
import '../models/push_action_dto.dart';
import '../models/push_token_dto.dart';
import '../models/quiet_hours_dto.dart';
import '../models/read_notifications_dto.dart';
import '../models/read_notifications_result_envelope.dart';
import '../models/timezone_dto.dart';
import '../models/update_new_case_alerts_dto.dart';
import '../models/update_notification_settings_dto.dart';
import '../models/update_topic_settings_dto.dart';
import '../models/voip_token_dto.dart';

part 'notifications_client.g.dart';

@RestApi()
abstract class NotificationsClient {
  factory NotificationsClient(Dio dio, {String? baseUrl}) =
      _NotificationsClient;

  /// Notifications, newest first (§9.1).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [updatedSince] - Owner 2026-10-22 (client economy plan, package F): only the notifications created or read since (ISO), newest first — the catch-up after a reconnect (`group` applies, `q` and `cursor` are ignored). meta.syncedAt = pass it back next time; meta.deletedIds stays empty (old rows expire by age). Older than 7 days → 409 SYNC_TOO_OLD.
  ///
  /// [group] - important: bids, cases, payments, account; other: likes, follows, comments, logins. Omit for all.
  ///
  /// [q] - Words from the stored text (a broadcast's title/body, a moderator's reason) or the name of the attorney in the notification, in any alphabet. Combines with `group`.
  @GET('/notifications')
  Future<NotificationListEnvelope> listNotifications({
    @Query('cursor') String? cursor,
    @Query('updatedSince') DateTime? updatedSince,
    @Query('group') NotificationGroup? group,
    @Query('q') String? q,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Mark read: {ids} or {all: true} (§9.1)
  @POST('/notifications/read')
  Future<ReadNotificationsResultEnvelope> readNotifications({
    @Body() required ReadNotificationsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Unread chats + notifications (§10)
  @GET('/badges')
  Future<BadgesEnvelope> getBadges({@Extras() Map<String, dynamic>? extras});

  /// Push/email per category + quiet hours (§9.5)
  @GET('/notification-settings')
  Future<NotificationSettingsEnvelope> getNotificationSettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Update categories; system stays on (§9.5)
  @PUT('/notification-settings')
  Future<NotificationSettingsEnvelope> updateNotificationSettings({
    @Body() required UpdateNotificationSettingsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Qualifications for new-case alerts
  @GET('/notification-settings/new-cases')
  Future<NewCaseAlertsEnvelope> getNewCaseAlerts({
    @Extras() Map<String, dynamic>? extras,
  });

  /// New-case alerts: the profile's qualifications or a chosen list
  @PUT('/notification-settings/new-cases')
  Future<NewCaseAlertsEnvelope> setNewCaseAlerts({
    @Body() required UpdateNewCaseAlertsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Set the person's IANA time zone
  @PUT('/me/timezone')
  Future<void> setTimezone({
    @Body() required TimezoneDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Quiet hours; start: null clears (§9.5)
  @PUT('/notification-settings/quiet-hours')
  Future<NotificationSettingsEnvelope> setQuietHours({
    @Body() required QuietHoursDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Kinds of notifications on/off; locked stay on
  @PUT('/notification-settings/topics')
  Future<NotificationSettingsEnvelope> updateNotificationTopics({
    @Body() required UpdateTopicSettingsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Unread number on the app icon on/off
  @PUT('/notification-settings/icon-badge')
  Future<NotificationSettingsEnvelope> setIconBadge({
    @Body() required IconBadgeDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Register this device for push (§9.5)
  @POST('/push-tokens')
  Future<void> registerPushToken({
    @Body() required PushTokenDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Unregister a device (sign-out) (§9.5)
  @DELETE('/push-tokens')
  Future<void> deletePushToken({
    @Body() required DeletePushTokenDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Planner reminders this device keeps as alarms
  @PUT('/push-tokens/armed')
  Future<void> setArmedReminders({
    @Body() required ArmedRemindersDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Register this iPhone for call (VoIP) pushes
  @POST('/push-tokens/voip')
  Future<void> registerVoipToken({
    @Body() required VoipTokenDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Stop call (VoIP) pushes to this iPhone
  @DELETE('/push-tokens/voip')
  Future<void> deleteVoipToken({
    @Body() required DeletePushTokenDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Reply / mark read from a chat notification
  @POST('/push-actions')
  Future<void> pushAction({
    @Body() required PushActionDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
