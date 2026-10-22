import 'dart:async';

import 'package:app_badge_plus/app_badge_plus.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/realtime_client.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

extension on String {
  String? get nullIfEmpty => isEmpty ? null : this;
}

Duration? _noRetry(int retryCount, Object error) => null;

final notificationsRepositoryProvider = Provider<NotificationsRepository>(
  (ref) => ApiNotificationsRepository(ref.watch(dioProvider)),
);

/// docs/05 §10 badges: loaded once, then kept current by `badge:update`
/// (and re-read after a reconnect). Mirrors [Badges.total] on the iOS
/// app icon.
class BadgesNotifier extends Notifier<Badges> {
  @override
  Badges build() {
    if (ref.watch(currentUserIdProvider) == null) {
      unawaited(_appIcon(0));
      return const Badges();
    }
    // Audit 2026-10-02: the "category off" switches are loaded with the
    // badges (so the first chime/ring after a cold start honours them).
    ref.listen(mutedCategoriesProvider, (_, __) {});
    // Owner 2026-10-21 (inbox 29/29b): Settings → Notifications changed
    // (here or re-read): the icon follows «Счётчик на иконке» at once and
    // the counters are re-read (a kind switched off leaves them).
    ref.listen(notificationSettingsProvider, (prev, next) {
      final s = next.value;
      if (s == null || prev?.value == null || identical(prev!.value, s)) {
        return;
      }
      _set(state);
      unawaited(refresh());
    });
    final sub = ref.watch(realtimeEventsProvider).listen((e) {
      if (e.name == 'badge:update') {
        // An assistant's socket also sits in the attorney's room: its
        // badges come from GET /badges (attorney's chats + own bell).
        if (ref.read(isAssistantProvider)) {
          unawaited(refresh());
          return;
        }
        final b = Badges.fromEvent(e.data);
        if (b != null) _set(b);
      } else if (e.name == 'notification:new') {
        // The open bell list shows the new row live.
        ref.invalidate(notificationsProvider);
      } else if (e.name == RealtimeEvent.reconnected) {
        unawaited(ref.read(notificationSettingsProvider.notifier).reload());
        unawaited(refresh());
      }
    });
    ref.onDispose(sub.cancel);
    unawaited(Future.microtask(refresh));
    return const Badges();
  }

  Future<void> refresh() async {
    try {
      _set(await ref.read(notificationsRepositoryProvider).badges());
    } on Object {
      // Offline: keep the last known numbers.
    }
  }

  void _set(Badges b) {
    if (!ref.mounted) return;
    // Owner 2026-10-21 (inbox 29): «Счётчик на иконке в меню» — the
    // settings state (changed here at once) wins over a count that was
    // already on its way.
    final on =
        ref.read(notificationSettingsProvider).value?.iconBadge ?? b.iconBadge;
    state = Badges(
      chats: b.chats,
      notifications: b.notifications,
      iconBadge: on,
    );
    unawaited(_appIcon(state.iconCount));
  }

  static Future<void> _appIcon(int n) async {
    if (kIsWeb) return; // no launcher badge in a browser
    try {
      if (await AppBadgePlus.isSupported()) await AppBadgePlus.updateBadge(n);
    } on Object {
      // Not supported on this launcher / platform.
    }
  }
}

final badgesProvider = NotifierProvider<BadgesNotifier, Badges>(
  BadgesNotifier.new,
);

/// Owner 2026-10-02: the categories switched off in Settings → Notifications
/// (the same screen opens from the bell and from Profile → Settings). Off =
/// still delivered, but no badge, no chime, calls ring silently.
final mutedCategoriesProvider = FutureProvider<Set<NotifCategory>>((ref) async {
  if (ref.watch(currentUserIdProvider) == null) return const {};
  // Owner 2026-10-21 (29b): the same state the settings screen shows.
  final s = await ref.watch(notificationSettingsProvider.future);
  return {
    for (final c in s.categories)
      if (!c.locked && !c.push) c.category,
  };
});

/// Synchronous read with a safe default (nothing muted until loaded).
bool isCategoryMuted(Ref ref, NotifCategory c) =>
    ref.read(mutedCategoriesProvider).value?.contains(c) ?? false;

/// Owner 2026-10-06: the bell's open tab (null = All); kept while the app
/// runs so the bell reopens on the same tab.
class NotificationGroupNotifier extends Notifier<NotifGroup?> {
  @override
  NotifGroup? build() => null;

  // ignore: use_setters_to_change_properties
  void set(NotifGroup? group) => state = group;
}

final notificationGroupProvider =
    NotifierProvider<NotificationGroupNotifier, NotifGroup?>(
  NotificationGroupNotifier.new,
);

/// Owner 2026-10-18: the text typed in the bell's search box ('' = none).
class NotificationQueryNotifier extends Notifier<String> {
  @override
  String build() => '';

  // ignore: use_setters_to_change_properties
  void set(String query) => state = query;
}

final notificationQueryProvider =
    NotifierProvider.autoDispose<NotificationQueryNotifier, String>(
  NotificationQueryNotifier.new,
);

/// docs/05 §9.1 notifications list (of the open tab).
class NotificationsNotifier extends PagedNotifier<AppNotification> {
  @override
  Future<PaginatedList<AppNotification>> build() {
    // Another tab = a fresh first page.
    ref
      ..watch(notificationGroupProvider)
      ..watch(notificationQueryProvider);
    return super.build();
  }

  @override
  Future<CursorPage<AppNotification>> fetch(String? cursor) =>
      ref.read(notificationsRepositoryProvider).list(
            cursor: cursor,
            group: ref.read(notificationGroupProvider),
            query: ref.read(notificationQueryProvider).nullIfEmpty,
          );

  @override
  Object idOf(AppNotification item) => item.id;

  /// Marks read locally and on the server (tap on a row, "Отметить все").
  Future<void> markRead({String? id}) async {
    final current = state.value;
    if (current != null) {
      state = AsyncData(
        PaginatedList(
          items: [
            for (final n in current.items)
              // ignore: prefer_if_elements_to_conditional_expressions
              id == null || n.id == id ? n.markedRead() : n,
          ],
          nextCursor: current.nextCursor,
        ),
      );
    }
    try {
      await ref
          .read(notificationsRepositoryProvider)
          .markRead(ids: id == null ? null : [id], all: id == null);
    } on Object {
      // The list is only a view; the next refresh shows the truth.
    }
    unawaited(ref.read(badgesProvider.notifier).refresh());
  }
}

final notificationsProvider = AsyncNotifierProvider.autoDispose<
    NotificationsNotifier,
    PaginatedList<AppNotification>>(NotificationsNotifier.new, retry: _noRetry);

/// Owner 2026-10-01: qualifications for "new case" alerts (attorneys).
final newCaseAlertsProvider = FutureProvider.autoDispose<NewCaseAlerts>(
  (ref) => ref.watch(notificationsRepositoryProvider).newCaseAlerts(),
  retry: _noRetry,
);

/// Owner 2026-10-21 (inbox 29b): Settings → Notifications — one state for
/// the screen (opened from the bell and from Profile → Settings), the
/// chimes / ringing ([mutedCategoriesProvider]) and the app icon. Every
/// change is shown at once and rolled back if the server says no.
class NotificationSettingsNotifier extends AsyncNotifier<NotificationSettings> {
  @override
  Future<NotificationSettings> build() async {
    if (ref.watch(currentUserIdProvider) == null) {
      return const NotificationSettings(categories: []);
    }
    return ref.watch(notificationsRepositoryProvider).settings();
  }

  NotificationsRepository get _repo =>
      ref.read(notificationsRepositoryProvider);

  /// Re-reads quietly (the screen opens, the socket reconnects): the old
  /// state stays on screen meanwhile.
  Future<void> reload() async {
    try {
      final s = await _repo.settings();
      if (ref.mounted) state = AsyncData(s);
    } on Object {
      // Offline: keep what is shown.
    }
  }

  Future<void> _apply(
    NotificationSettings optimistic,
    Future<NotificationSettings> Function() call,
  ) async {
    final before = state.value;
    state = AsyncData(optimistic);
    try {
      final saved = await call();
      if (ref.mounted) state = AsyncData(saved);
    } on Object {
      if (ref.mounted && before != null) state = AsyncData(before);
      rethrow;
    }
  }

  Future<void> setTopic(TopicSetting t, {required bool push}) {
    final s = state.requireValue;
    final next = t.copyWith(push: push);
    return _apply(
      s.copyWith(
        topics: [
          // ignore: prefer_if_elements_to_conditional_expressions
          for (final x in s.topics) x.key == t.key ? next : x,
        ],
      ),
      () => _repo.updateTopics([next]),
    );
  }

  Future<void> setQuietHours(QuietHours? q) => _apply(
        state.requireValue.copyWith(quietHours: () => q),
        () => _repo.setQuietHours(q),
      );

  /// Owner 2026-10-21 (inbox 29): off clears the app icon at once.
  /// [BadgesNotifier] follows this state, so the icon changes at once.
  Future<void> setIconBadge({required bool enabled}) => _apply(
        state.requireValue.copyWith(iconBadge: enabled),
        () => _repo.setIconBadge(enabled: enabled),
      );
}

final notificationSettingsProvider =
    AsyncNotifierProvider<NotificationSettingsNotifier, NotificationSettings>(
  NotificationSettingsNotifier.new,
  retry: _noRetry,
);
