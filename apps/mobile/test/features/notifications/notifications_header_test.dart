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

/// Owner 2026-10-23: the bell's header, from the right edge: bell (where it
/// is on Chats) · notification settings · mark all read; no search, no chips.
void main() {
  setUpAll(initializeDateFormatting);

  for (final role in [UserRole.attorney, UserRole.client]) {
    for (final scale in [1.0, 2.0]) {
      for (final width in [320.0, 360.0]) {
        testWidgets(
          'notifications header: done-all, settings, bell; no search, no '
          'overlap (${role.name}, x$scale, ${width.toInt()} dp)',
          (tester) async {
            tester.view.physicalSize = Size(width, 780);
            tester.view.devicePixelRatio = 1;
            addTearDown(tester.view.reset);
            final t = L10nTranslator(language: AppLanguage.ru, cache: const {});
            await tester.pumpWidget(
              uxApp(
                const InboxScreen(),
                theme: AppTheme.light(),
                size: Size(width, 780),
                textScale: scale,
                disableAnimations: true,
                overrides: uxOverrides(
                  translator: t,
                  extra: [
                    chatRepositoryProvider.overrideWithValue(_Chats()),
                    notificationsRepositoryProvider
                        .overrideWithValue(_Notifs()),
                    groupRepositoryProvider
                        .overrideWithValue(FakeGroupRepository()),
                    currentUserIdProvider.overrideWithValue('me'),
                    currentUserRoleProvider.overrideWithValue(role),
                    realtimeClientProvider.overrideWithValue(null),
                    badgesProvider.overrideWith(_UnreadBadges.new),
                  ],
                ),
              ),
            );
            await tester.pumpAndSettle();
            // The bell never moves between Chats and Notifications.
            final bellOnChats =
                tester.getCenter(find.byKey(const ValueKey('inbox-bell')));
            await tester.tap(find.byKey(const ValueKey('inbox-bell')));
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);

            final bell =
                tester.getRect(find.byKey(const ValueKey('inbox-bell')));
            final settings =
                tester.getRect(find.byKey(const ValueKey('notif-filter')));
            final done =
                tester.getRect(find.byKey(const ValueKey('notif-mark-all')));
            expect(done.center.dx, lessThan(settings.center.dx));
            expect(settings.center.dx, lessThan(bell.center.dx));
            expect(done.right, lessThanOrEqualTo(settings.left + 0.5));
            expect(settings.right, lessThanOrEqualTo(bell.left + 0.5));
            expect((bell.center.dx - bellOnChats.dx).abs(), lessThan(1));
            expect((bell.center.dy - settings.center.dy).abs(), lessThan(1));
            expect((settings.center.dy - done.center.dy).abs(), lessThan(1));
            // Even spacing: equal gaps between neighbours.
            expect(
              ((settings.left - done.right) - (bell.left - settings.right))
                  .abs(),
              lessThan(1),
            );

            expect(
              find.byKey(const ValueKey('notif-search-top')),
              findsNothing,
            );
            expect(find.byKey(const ValueKey('notif-search')), findsNothing);
            for (final k in [
              'notif-view-all',
              'notif-view-important',
              'notif-view-other',
              'notif-view-assistants',
            ]) {
              expect(find.byKey(ValueKey(k)), findsNothing);
            }
            await tester.pumpWidget(const SizedBox());
            await tester.pump(const Duration(minutes: 5));
          },
        );
      }
    }
  }
}
