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

class _UnreadBadges extends BadgesNotifier {
  @override
  Badges build() => const Badges(notifications: 3);
}

/// Owner 2026-10-28: Notifications opened by the bell lies ON TOP of Chats;
/// back arrow, system back and the bell itself all land on Chats again.
void main() {
  setUpAll(initializeDateFormatting);

  Future<void> open(WidgetTester tester) async {
    tester.view.physicalSize = const Size(390, 780);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final t = L10nTranslator(language: AppLanguage.ru, cache: const {});
    await tester.pumpWidget(
      uxApp(
        const InboxScreen(),
        theme: AppTheme.light(),
        size: const Size(390, 780),
        disableAnimations: true,
        overrides: uxOverrides(
          translator: t,
          extra: [
            chatRepositoryProvider.overrideWithValue(_Chats()),
            notificationsRepositoryProvider.overrideWithValue(_Notifs()),
            groupRepositoryProvider.overrideWithValue(FakeGroupRepository()),
            currentUserIdProvider.overrideWithValue('me'),
            currentUserRoleProvider.overrideWithValue(UserRole.client),
            realtimeClientProvider.overrideWithValue(null),
            badgesProvider.overrideWith(_UnreadBadges.new),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  final onChats = find.byKey(const ValueKey('chat-search-top'));
  final onNotifications = find.byKey(const ValueKey('notif-filter'));

  Future<void> openBell(WidgetTester tester) async {
    expect(onChats, findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('inbox-bell')));
    await tester.pumpAndSettle();
    expect(onNotifications, findsOneWidget);
    expect(onChats, findsNothing);
  }

  testWidgets('back arrow returns to Chats', (tester) async {
    await open(tester);
    await openBell(tester);
    await tester.tap(find.byType(AppBackButton));
    await tester.pumpAndSettle();
    expect(onChats, findsOneWidget);
    expect(onNotifications, findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('system back (Android) returns to Chats', (tester) async {
    await open(tester);
    await openBell(tester);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(onChats, findsOneWidget);
    expect(onNotifications, findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('tapping the bell again returns to Chats', (tester) async {
    await open(tester);
    await openBell(tester);
    await tester.tap(find.byKey(const ValueKey('inbox-bell')));
    await tester.pumpAndSettle();
    expect(onChats, findsOneWidget);
    expect(onNotifications, findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('edge swipe left to right returns to Chats', (tester) async {
    await open(tester);
    await openBell(tester);
    final g = await tester.startGesture(const Offset(2, 400));
    for (var i = 0; i < 12; i++) {
      await g.moveBy(const Offset(30, 0));
      await tester.pump(const Duration(milliseconds: 16));
    }
    await g.up();
    await tester.pumpAndSettle();
    expect(onChats, findsOneWidget);
    expect(onNotifications, findsNothing);
    await tester.pumpWidget(const SizedBox());
  });
}
