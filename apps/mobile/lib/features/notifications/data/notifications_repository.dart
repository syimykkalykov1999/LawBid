import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/sync/synced_list_notifier.dart' show SyncedPage;
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

// Owner 2026-09-30: `calls` — incoming and missed calls; `following` and
// `newCases` — opt-in alerts (off until turned on).
enum NotifCategory {
  messages,
  groups,
  channels,
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
  const Badges({this.chats = 0, this.notifications = 0, this.iconBadge = true});

  /// The badges inside `GET /me/session` (package G).
  factory Badges.fromSession(api.BadgesDto d) => Badges(
        chats: d.chatsUnread.toInt(),
        notifications: d.notificationsUnread.toInt(),
        iconBadge: d.iconBadge ?? true,
      );

  final int chats;
  final int notifications;

  /// Owner 2026-10-21 (inbox 29): false = keep the app icon clear.
  final bool iconBadge;

  int get total => chats + notifications;

  /// The number on the app icon (0 while «Счётчик на иконке» is off).
  int get iconCount => iconBadge ? total : 0;

  static Badges? fromEvent(Object? data) {
    if (data is! Map) return null;
    final c = data['chatsUnread'];
    final n = data['notificationsUnread'];
    if (c is! num || n is! num) return null;
    return Badges(
      chats: c.toInt(),
      notifications: n.toInt(),
      iconBadge: data['iconBadge'] != false,
    );
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

/// Owner 2026-10-21 (inbox 30): one switch of Settings → Notifications
/// (apps/api notification-topics.ts). [block] groups it on screen.
@immutable
class TopicSetting {
  const TopicSetting({
    required this.key,
    required this.block,
    required this.push,
    this.locked = false,
    this.attorneyOnly = false,
    this.parent,
  });

  final String key;
  final String block;
  final bool push;
  final bool locked;
  final bool attorneyOnly;

  /// Needs this switch on too (nested under it).
  final String? parent;

  TopicSetting copyWith({required bool push}) => TopicSetting(
        key: key,
        block: block,
        push: push,
        locked: locked,
        attorneyOnly: attorneyOnly,
        parent: parent,
      );
}

@immutable
class NotificationSettings {
  const NotificationSettings({
    required this.categories,
    this.quietHours,
    this.iconBadge = true,
    this.topics = const [],
  });

  final List<CategorySetting> categories;
  final QuietHours? quietHours;

  /// Owner 2026-10-21 (inbox 29): the unread number on the app icon.
  final bool iconBadge;
  final List<TopicSetting> topics;

  NotificationSettings copyWith({
    List<CategorySetting>? categories,
    QuietHours? Function()? quietHours,
    bool? iconBadge,
    List<TopicSetting>? topics,
  }) =>
      NotificationSettings(
        categories: categories ?? this.categories,
        quietHours: quietHours != null ? quietHours() : this.quietHours,
        iconBadge: iconBadge ?? this.iconBadge,
        topics: topics ?? this.topics,
      );
}

/// docs/05 §9, §10, §15 "Уведомления и push". Throws [ApiException].
/// Owner 2026-10-01: which qualifications send "new case" alerts.
@immutable
class NewCaseAlerts {
  const NewCaseAlerts({
    required this.useProfile,
    required this.practiceAreaIds,
    required this.profilePracticeAreaIds,
    this.urgentOnly = false,
  });

  /// true = the profile's qualifications (the default).
  final bool useProfile;

  /// The attorney's own list (kept while "as in my profile" is on).
  final List<String> practiceAreaIds;
  final List<String> profilePracticeAreaIds;

  /// Owner 2026-10-05: only urgent cases (urgent / very urgent today,
  /// a date within days) send alerts.
  final bool urgentOnly;

  /// What actually sends alerts now.
  List<String> get effective =>
      useProfile ? profilePracticeAreaIds : practiceAreaIds;
}

/// Owner 2026-10-06: the bell's tabs — "Важные" (bids, cases, payments,
/// chats, the account) and "Остальные" (likes, follows, comments, logins).
/// The server decides which type is which.
enum NotifGroup { important, other }

/// Package F: the `?updatedSince` side of the bell list, apart from
/// [NotificationsRepository] so the test fakes need not know it.
// ignore: one_member_abstracts
abstract interface class NotificationsSyncRepository {
  Future<SyncedPage<AppNotification>> listChangedSince(
    DateTime since, {
    NotifGroup? group,
  });
}

abstract interface class NotificationsRepository {
  /// [group] null = every notification; [query] null/empty = no search
  /// (Owner 2026-10-18: matches the text and the attorney's name).
  Future<CursorPage<AppNotification>> list({
    String? cursor,
    NotifGroup? group,
    String? query,
  });
  Future<void> markRead({List<String>? ids, bool all = false});
  Future<Badges> badges();
  Future<NotificationSettings> settings();
  Future<NotificationSettings> updateSettings(List<CategorySetting> items);
  Future<NotificationSettings> setQuietHours(QuietHours? quietHours);

  /// Owner 2026-10-21 (inbox 29): «Счётчик на иконке в меню».
  Future<NotificationSettings> setIconBadge({required bool enabled});

  /// Owner 2026-10-21 (inbox 30): a switch per kind of notification.
  Future<NotificationSettings> updateTopics(List<TopicSetting> items);
  Future<NewCaseAlerts> newCaseAlerts();

  /// [practiceAreaIds] null keeps the saved list (switching modes only);
  /// [urgentOnly] null keeps the saved switch.
  Future<NewCaseAlerts> setNewCaseAlerts({
    required bool useProfile,
    List<String>? practiceAreaIds,
    bool? urgentOnly,
  });
  Future<void> registerPushToken(
    String token, {
    required bool ios,
    bool web = false,

    /// Owner 2026-10-20: this app keeps planner reminders as local alarms
    /// and shows the reminder push itself (Android).
    bool localReminders = false,

    /// Owner 2026-10-22: this app draws chat notifications itself
    /// (WhatsApp-style, Android) from a data-only push.
    bool chatStyle = false,
  });
  Future<void> deletePushToken(String token);

  /// Owner 2026-10-20: the reminders this iPhone has armed as local alarms
  /// (`<taskId>@<remindAt ms>`); the reminder push skips them.
  Future<void> setArmedReminders(String token, List<String> ids);

  /// Owner 2026-10-20: the phone's IANA time zone — the server repeats
  /// tasks and sends daily reminders by this clock.
  Future<void> setTimezone(String timezone);

  /// Owner 2026-10-17: an iPhone's PushKit token for incoming calls.
  Future<void> registerVoipToken(
    String token, {
    required String bundleId,
    required bool production,
  });
  Future<void> deleteVoipToken(String token);
}

class ApiNotificationsRepository
    implements NotificationsRepository, NotificationsSyncRepository {
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
        iconBadge: d.iconBadge,
        topics: [
          for (final x in d.topics)
            // A switch this build doesn't know yet is left out.
            if (x.topic.json != null && x.block.json != null)
              TopicSetting(
                key: x.topic.json!,
                block: x.block.json!,
                push: x.pushEnabled,
                locked: x.locked,
                attorneyOnly: x.attorneyOnly,
                parent: x.parent,
              ),
        ],
      );

  @override
  Future<NotificationSettings> setIconBadge({required bool enabled}) async =>
      _settings(
        (await guardApiCall(
          () => _api.setIconBadge(body: api.IconBadgeDto(enabled: enabled)),
        ))
            .data,
      );

  @override
  Future<NotificationSettings> updateTopics(List<TopicSetting> items) async =>
      _settings(
        (await guardApiCall(
          () => _api.updateNotificationTopics(
            body: api.UpdateTopicSettingsDto(
              items: [
                for (final i in items)
                  api.TopicSettingDto(
                    topic: api.NotificationTopic.fromJson(i.key),
                    pushEnabled: i.push,
                  ),
              ],
            ),
          ),
        ))
            .data,
      );

  @override
  Future<CursorPage<AppNotification>> list({
    String? cursor,
    NotifGroup? group,
    String? query,
  }) async {
    final env = await guardApiCall(
      () => _api.listNotifications(
        cursor: cursor,
        q: (query == null || query.trim().isEmpty) ? null : query.trim(),
        group: _group(group),
      ),
    );
    return CursorPage(
      items: env.data.map(fromDto).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  /// Owner 2026-10-22 (client economy plan, package F): only the rows
  /// created or read since [since] (newest first); `group` applies.
  @override
  Future<SyncedPage<AppNotification>> listChangedSince(
    DateTime since, {
    NotifGroup? group,
  }) async {
    final env = await guardApiCall(
      () => _api.listNotifications(
        updatedSince: since.toUtc(),
        group: _group(group),
      ),
    );
    return SyncedPage(
      items: env.data.map(fromDto).toList(),
      deletedIds: env.meta?.deletedIds ?? const [],
      syncedAt: env.meta?.syncedAt,
    );
  }

  static api.NotificationGroup? _group(NotifGroup? group) => switch (group) {
        NotifGroup.important => api.NotificationGroup.important,
        NotifGroup.other => api.NotificationGroup.other,
        null => null,
      };

  static AppNotification fromDto(api.NotificationDto n) => AppNotification(
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
      );

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
      iconBadge: d.iconBadge ?? true,
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
                    category: api.CategorySettingDtoCategory.values.byName(
                      i.category.name,
                    ),
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
        urgentOnly: d.urgentOnly,
      );

  @override
  Future<NewCaseAlerts> newCaseAlerts() async =>
      _alerts((await guardApiCall(_api.getNewCaseAlerts)).data);

  @override
  Future<NewCaseAlerts> setNewCaseAlerts({
    required bool useProfile,
    List<String>? practiceAreaIds,
    bool? urgentOnly,
  }) async =>
      _alerts(
        (await guardApiCall(
          () => _api.setNewCaseAlerts(
            body: api.UpdateNewCaseAlertsDto(
              useProfile: useProfile,
              practiceAreaIds: practiceAreaIds,
              urgentOnly: urgentOnly,
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
  Future<void> registerPushToken(
    String token, {
    required bool ios,
    bool web = false,
    bool localReminders = false,
    bool chatStyle = false,
  }) =>
      guardApiCall(
        () => _api.registerPushToken(
          body: api.PushTokenDto(
            token: token,
            platform: web
                ? api.PushTokenDtoPlatform.web
                : ios
                    ? api.PushTokenDtoPlatform.ios
                    : api.PushTokenDtoPlatform.android,
            localReminders: localReminders,
            chatStyle: chatStyle,
          ),
        ),
      );

  @override
  Future<void> setArmedReminders(String token, List<String> ids) =>
      guardApiCall(
        () => _api.setArmedReminders(
          body: api.ArmedRemindersDto(token: token, ids: ids),
        ),
      );

  @override
  Future<void> setTimezone(String timezone) => guardApiCall(
        () => _api.setTimezone(body: api.TimezoneDto(timezone: timezone)),
      );

  @override
  Future<void> deletePushToken(String token) => guardApiCall(
        () => _api.deletePushToken(body: api.DeletePushTokenDto(token: token)),
      );

  @override
  Future<void> registerVoipToken(
    String token, {
    required String bundleId,
    required bool production,
  }) =>
      guardApiCall(
        () => _api.registerVoipToken(
          body: api.VoipTokenDto(
            token: token,
            bundleId: bundleId,
            environment: production
                ? api.VoipTokenDtoEnvironment.production
                : api.VoipTokenDtoEnvironment.sandbox,
          ),
        ),
      );

  @override
  Future<void> deleteVoipToken(String token) => guardApiCall(
        () => _api.deleteVoipToken(body: api.DeletePushTokenDto(token: token)),
      );
}
