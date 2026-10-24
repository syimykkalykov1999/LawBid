import 'package:flutter/material.dart';
import 'package:flutter/widgets.dart';
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

/// Owner 2026-10-23: the «+» (new chat) sits clearly above the bottom edge
/// and the home indicator, the same gap on every phone - even when the
/// app's shell has removed the screen's own bottom inset.
void main() {
  setUpAll(initializeDateFormatting);

  // (name, logical size, device bottom inset)
  const phones = <(String, Size, double)>[
    ('iPhone 17 Pro Max', Size(440, 956), 34),
    ('iPhone SE (home button)', Size(375, 667), 0),
    ('small iPhone 13 mini', Size(375, 812), 34),
    ('Android gesture bar', Size(360, 800), 24),
  ];

  for (final (name, size, inset) in phones) {
    testWidgets('new-chat button clears the bottom inset ($name)',
        (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      tester.view.viewPadding = FakeViewPadding(bottom: inset);
      tester.view.padding = FakeViewPadding(bottom: inset);
      addTearDown(tester.view.reset);
      final t = L10nTranslator(language: AppLanguage.ru, cache: const {});
      await tester.pumpWidget(
        uxApp(
          const InboxScreen(),
          theme: AppTheme.light(),
          size: size,
          disableAnimations: true,
          // The shell hands the page no bottom inset (padding zero).
          overrides: uxOverrides(
            translator: t,
            extra: [
              chatRepositoryProvider.overrideWithValue(_Chats()),
              groupRepositoryProvider.overrideWithValue(FakeGroupRepository()),
              currentUserIdProvider.overrideWithValue('me'),
              currentUserRoleProvider.overrideWithValue(UserRole.attorney),
              realtimeClientProvider.overrideWithValue(null),
            ],
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      final fab = tester.getRect(find.byKey(const ValueKey('chats-new-chat')));
      final gap = size.height - fab.bottom;
      // At least the Scaffold's 16 + the lift above the device inset.
      expect(gap, greaterThanOrEqualTo(inset + 16 + AppSpacing.sm - 0.5));
      // The same gap above the safe area on every phone.
      expect(gap - inset, closeTo(16 + AppSpacing.sm, 0.5));
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(minutes: 5));
    });
  }
}
