import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

// Owner 2026-09-30: `calls` — incoming and missed calls; `following` and
// `newCases` — opt-in alerts (off until turned on).
enum NotifCategory {
  messages,
  calls,
  bids,
  cases,
  social,
  following,
  newCases,
  system,
  marketing,
}

@immutable
class NotifActor {
  const NotifActor({
    required this.displayName,
    this.id,
    this.username,
    this.avatarUrl,
  });

  /// null for a client (no public profile).
  final String? id;
  final String displayName;
  final String? username;
  final String? avatarUrl;
}

/// One row of the Notifications tab (docs/05 §9.1).
@immutable
class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.category,
    required this.payload,
    required this.aggregateCount,
    required this.createdAt,
    this.actor,
    this.readAt,
  });

  final String id;
  final String type;
  final NotifCategory category;
  final Map<String, Object?> payload;
  final NotifActor? actor;
  final int aggregateCount;
  final DateTime? readAt;
  final DateTime createdAt;

  bool get unread => readAt == null;

  String? str(String key) {
    final v = payload[key];
    return v is String ? v : null;
  }

  AppNotification markedRead() => AppNotification(
        id: id,
        type: type,
        category: category,
        payload: payload,
        actor: actor,
        aggregateCount: aggregateCount,
        readAt: readAt ?? DateTime.now(),
        createdAt: createdAt,
      );
}

/// docs/05 §10 badges.
@immutable
class Badges {
  const Badges({this.chats = 0, this.notifications = 0});

  final int chats;
  final int notifications;

  int get total => chats + notifications;

  static Badges? fromEvent(Object? data) {
    if (data is! Map) return null;
    final c = data['chatsUnread'];
    final n = data['notificationsUnread'];
    if (c is! num || n is! num) return null;
    return Badges(chats: c.toInt(), notifications: n.toInt());
  }
}

@immutable
class CategorySetting {
  const CategorySetting({
    required this.category,
    required this.push,
    required this.email,
    required this.locked,
  });

  final NotifCategory category;
  final bool push;
  final bool email;
  final bool locked;

  CategorySetting copyWith({bool? push, bool? email}) => CategorySetting(
        category: category,
        push: push ?? this.push,
        email: email ?? this.email,
        locked: locked,
      );
}

@immutable
class QuietHours {
  const QuietHours({
    required this.start,
    required this.end,
    required this.timezone,
  });

  /// "22:00"
  final String start;
  final String end;
  final String timezone;
}

@immutable
class NotificationSettings {
  const NotificationSettings({required this.categories, this.quietHours});

  final List<CategorySetting> categories;
  final QuietHours? quietHours;
}

/// docs/05 §9, §10, §15 "Уведомления и push". Throws [ApiException].
/// Owner 2026-10-01: which qualifications send "new case" alerts.
@immutable
class NewCaseAlerts {
  const NewCaseAlerts({
    required this.useProfile,
    required this.practiceAreaIds,
    required this.profilePracticeAreaIds,
  });

  /// true = the profile's qualifications (the default).
  final bool useProfile;

  /// The attorney's own list (kept while "as in my profile" is on).
  final List<String> practiceAreaIds;
  final List<String> profilePracticeAreaIds;

  /// What actually sends alerts now.
  List<String> get effective =>
      useProfile ? profilePracticeAreaIds : practiceAreaIds;
}

abstract interface class NotificationsRepository {
  Future<CursorPage<AppNotification>> list({String? cursor});
  Future<void> markRead({List<String>? ids, bool all = false});
  Future<Badges> badges();
  Future<NotificationSettings> settings();
  Future<NotificationSettings> updateSettings(List<CategorySetting> items);
  Future<NotificationSettings> setQuietHours(QuietHours? quietHours);
  Future<NewCaseAlerts> newCaseAlerts();

  /// [practiceAreaIds] null keeps the saved list (switching modes only).
  Future<NewCaseAlerts> setNewCaseAlerts({
    required bool useProfile,
    List<String>? practiceAreaIds,
  });
  Future<void> registerPushToken(String token, {required bool ios});
  Future<void> deletePushToken(String token);
}

class ApiNotificationsRepository implements NotificationsRepository {
  ApiNotificationsRepository(Dio dio) : _api = api.NotificationsClient(dio);

  final api.NotificationsClient _api;

  /// `new_cases` → [NotifCategory.newCases].
  static NotifCategory _cat(String name) {
    final key = name.replaceAllMapped(
      RegExp('_([a-z])'),
      (m) => m.group(1)!.toUpperCase(),
    );
    return NotifCategory.values.firstWhere(
      (c) => c.name == key,
      orElse: () => NotifCategory.system,
    );
  }

  static NotificationSettings _settings(api.NotificationSettingsDto d) =>
      NotificationSettings(
        categories: [
          for (final c in d.categories)
            CategorySetting(
              category: _cat(c.category.json ?? 'system'),
              push: c.pushEnabled,
              email: c.emailEnabled,
              locked: c.locked,
            ),
        ],
        quietHours: d.quietHours?.start == null
            ? null
            : QuietHours(
                start: d.quietHours!.start!,
                end: d.quietHours!.end ?? d.quietHours!.start!,
                timezone: d.quietHours!.timezone ?? 'UTC',
              ),
      );

  @override
  Future<CursorPage<AppNotification>> list({String? cursor}) async {
    final env =
        await guardApiCall(() => _api.listNotifications(cursor: cursor));
    return CursorPage(
      items: [
        for (final n in env.data)
          AppNotification(
            id: n.id,
            type: n.type,
            category: _cat(n.category.json ?? 'system'),
            payload: n.payload is Map
                ? Map<String, Object?>.from(n.payload as Map)
                : const {},
            actor: n.actor == null
                ? null
                : NotifActor(
                    id: n.actor!.id,
                    displayName: n.actor!.displayName,
                    username: n.actor!.username,
                    avatarUrl: n.actor!.avatarUrl,
                  ),
            aggregateCount: n.aggregateCount.toInt(),
            readAt: n.readAt,
            createdAt: n.createdAt,
          ),
      ],
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<void> markRead({List<String>? ids, bool all = false}) => guardApiCall(
        () => _api.readNotifications(
          body: api.ReadNotificationsDto(
            ids: all ? null : ids,
            all: all ? true : null,
          ),
        ),
      );

  @override
  Future<Badges> badges() async {
    final d = (await guardApiCall(_api.getBadges)).data;
    return Badges(
      chats: d.chatsUnread.toInt(),
      notifications: d.notificationsUnread.toInt(),
    );
  }

  @override
  Future<NotificationSettings> settings() async =>
      _settings((await guardApiCall(_api.getNotificationSettings)).data);

  @override
  Future<NotificationSettings> updateSettings(
    List<CategorySetting> items,
  ) async =>
      _settings(
        (await guardApiCall(
          () => _api.updateNotificationSettings(
            body: api.UpdateNotificationSettingsDto(
              items: [
                for (final i in items)
                  api.CategorySettingDto(
                    category: api.CategorySettingDtoCategory.values
                        .byName(i.category.name),
                    pushEnabled: i.push,
                    emailEnabled: i.email,
                  ),
              ],
            ),
          ),
        ))
            .data,
      );

  static NewCaseAlerts _alerts(api.NewCaseAlertsDto d) => NewCaseAlerts(
        useProfile: d.useProfile,
        practiceAreaIds: d.practiceAreaIds,
        profilePracticeAreaIds: d.profilePracticeAreaIds,
      );

  @override
  Future<NewCaseAlerts> newCaseAlerts() async =>
      _alerts((await guardApiCall(_api.getNewCaseAlerts)).data);

  @override
  Future<NewCaseAlerts> setNewCaseAlerts({
    required bool useProfile,
    List<String>? practiceAreaIds,
  }) async =>
      _alerts(
        (await guardApiCall(
          () => _api.setNewCaseAlerts(
            body: api.UpdateNewCaseAlertsDto(
              useProfile: useProfile,
              practiceAreaIds: practiceAreaIds,
            ),
          ),
        ))
            .data,
      );

  @override
  Future<NotificationSettings> setQuietHours(QuietHours? q) async => _settings(
        (await guardApiCall(
          () => _api.setQuietHours(
            body: api.QuietHoursDto(
              start: q?.start,
              end: q?.end,
              timezone: q?.timezone,
            ),
          ),
        ))
            .data,
      );

  @override
  Future<void> registerPushToken(String token, {required bool ios}) =>
      guardApiCall(
        () => _api.registerPushToken(
          body: api.PushTokenDto(
            token: token,
            platform: ios
                ? api.PushTokenDtoPlatform.ios
                : api.PushTokenDtoPlatform.android,
          ),
        ),
      );

  @override
  Future<void> deletePushToken(String token) => guardApiCall(
        () => _api.deletePushToken(body: api.DeletePushTokenDto(token: token)),
      );
}
