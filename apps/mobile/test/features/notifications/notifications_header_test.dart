import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';
import '../groups/fake_group_repository.dart';

class _Chats implements ChatRepository {
  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) async =>
      const CursorPage(items: []);

  @override
  Future<({int waiting, int requests, int cases, int archived})>
      folderCounts() async => (waiting: 0, requests: 0, cases: 0, archived: 0);

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

class _Notifs implements NotificationsRepository {
  @override
  Future<CursorPage<AppNotification>> list({
    String? cursor,
    NotifGroup? group,
    String? query,
  }) async =>
      const CursorPage(items: []);

  @override
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

/// Owner 2026-10-22: the notifications screen has no section chips; its
/// header holds, close together, bell · filter · magnifier (left to right).
void main() {
  setUpAll(initializeDateFormatting);

  for (final role in [UserRole.attorney, UserRole.client]) {
    testWidgets('notifications header: bell, filter, magnifier; no chips '
        '(${role.name}, ru, 360 dp)', (tester) async {
      useNarrowPhone(tester);
      final t = L10nTranslator(language: AppLanguage.ru, cache: const {});
      await tester.pumpWidget(
        uxApp(
          const InboxScreen(),
          theme: AppTheme.light(),
          size: const Size(360, 780),
          disableAnimations: true,
          overrides: uxOverrides(
            translator: t,
            extra: [
              chatRepositoryProvider.overrideWithValue(_Chats()),
              notificationsRepositoryProvider.overrideWithValue(_Notifs()),
              groupRepositoryProvider.overrideWithValue(FakeGroupRepository()),
              currentUserIdProvider.overrideWithValue('me'),
              currentUserRoleProvider.overrideWithValue(role),
              realtimeClientProvider.overrideWithValue(null),
            ],
          ),
        ),
      );
      await tester.pumpAndSettle();
      // Owner 2026-10-23: the bell never moves between Chats and Notifications.
      final bellOnChats =
          tester.getCenter(find.byKey(const ValueKey('inbox-bell')));
      await tester.tap(find.byKey(const ValueKey('inbox-bell')));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);

      final bell = tester.getCenter(find.byKey(const ValueKey('inbox-bell')));
      final filter =
          tester.getCenter(find.byKey(const ValueKey('notif-filter')));
      final search =
          tester.getCenter(find.byKey(const ValueKey('notif-search-top')));
      // filter · magnifier · bell, the bell at the same place as on Chats.
      expect(filter.dx, lessThan(search.dx));
      expect(search.dx, lessThan(bell.dx));
      expect(bell.dx - filter.dx, lessThan(130));
      expect((bell.dx - bellOnChats.dx).abs(), lessThan(1));
      expect((bell.dy - filter.dy).abs(), lessThan(1));
      expect((filter.dy - search.dy).abs(), lessThan(1));

      for (final k in [
        'notif-view-all',
        'notif-view-important',
        'notif-view-other',
        'notif-view-assistants',
      ]) {
        expect(find.byKey(ValueKey(k)), findsNothing);
      }

      // The magnifier opens the same inline search.
      expect(find.byKey(const ValueKey('notif-search')), findsNothing);
      await tester.tap(find.byKey(const ValueKey('notif-search-top')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('notif-search')), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(minutes: 5));
    });
  }
}
