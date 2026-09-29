import 'dart:async';

import 'package:app_badge_plus/app_badge_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/realtime_client.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

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
    final sub = ref.watch(realtimeEventsProvider).listen((e) {
      if (e.name == 'badge:update') {
        final b = Badges.fromEvent(e.data);
        if (b != null) _set(b);
      } else if (e.name == RealtimeEvent.reconnected) {
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
    state = b;
    unawaited(_appIcon(b.total));
  }

  static Future<void> _appIcon(int n) async {
    try {
      if (await AppBadgePlus.isSupported()) await AppBadgePlus.updateBadge(n);
    } on Object {
      // Not supported on this launcher / platform.
    }
  }
}

final badgesProvider =
    NotifierProvider<BadgesNotifier, Badges>(BadgesNotifier.new);

/// docs/05 §9.1 notifications list.
class NotificationsNotifier extends PagedNotifier<AppNotification> {
  @override
  Future<CursorPage<AppNotification>> fetch(String? cursor) =>
      ref.read(notificationsRepositoryProvider).list(cursor: cursor);

  @override
  Object idOf(AppNotification item) => item.id;

  /// Marks read locally and on the server (tap on a row, "Отметить все").
  Future<void> markRead({String? id}) async {
    final current = state.value;
    if (current != null) {
      state = AsyncData(PaginatedList(
        items: [
          for (final n in current.items)
            id == null || n.id == id ? n.markedRead() : n,
        ],
        nextCursor: current.nextCursor,
      ));
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
    NotificationsNotifier, PaginatedList<AppNotification>>(
  NotificationsNotifier.new,
  retry: _noRetry,
);

final notificationSettingsProvider =
    FutureProvider.autoDispose<NotificationSettings>(
  (ref) => ref.watch(notificationsRepositoryProvider).settings(),
  retry: _noRetry,
);
