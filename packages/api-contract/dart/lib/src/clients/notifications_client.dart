// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/badges_envelope.dart';
import '../models/delete_push_token_dto.dart';
import '../models/new_case_alerts_envelope.dart';
import '../models/notification_list_envelope.dart';
import '../models/notification_settings_envelope.dart';
import '../models/push_token_dto.dart';
import '../models/quiet_hours_dto.dart';
import '../models/read_notifications_dto.dart';
import '../models/read_notifications_result_envelope.dart';
import '../models/update_new_case_alerts_dto.dart';
import '../models/update_notification_settings_dto.dart';

part 'notifications_client.g.dart';

@RestApi()
abstract class NotificationsClient {
  factory NotificationsClient(Dio dio, {String? baseUrl}) =
      _NotificationsClient;

  /// Notifications, newest first (§9.1).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/notifications')
  Future<NotificationListEnvelope> listNotifications({
    @Query('cursor') String? cursor,
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

  /// Quiet hours; start: null clears (§9.5)
  @PUT('/notification-settings/quiet-hours')
  Future<NotificationSettingsEnvelope> setQuietHours({
    @Body() required QuietHoursDto body,
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
}
