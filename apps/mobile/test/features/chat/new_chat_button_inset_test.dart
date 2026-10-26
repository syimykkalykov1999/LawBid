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
/// and the home indicator on an iPhone (inset + 8 dp above the standard
/// 16 dp), and on Android just 16 dp above the bottom edge of the content
/// (WhatsApp) - gesture navigation, no extra lift; the 3-button bar is cleared.
/// The app's shell hands the page no bottom inset, as in the app.
void main() {
  setUpAll(initializeDateFormatting);

  // (name, platform, logical size, device bottom inset, expected gap)
  const phones = <(String, TargetPlatform, Size, double, double)>[
    ('iPhone 17 Pro Max', TargetPlatform.iOS, Size(440, 956), 34, 34 + 16 + 8),
    ('iPhone SE (home button)', TargetPlatform.iOS, Size(375, 667), 0, 16 + 8),
    (
      'Android gesture navigation (S25 Ultra)',
      TargetPlatform.android,
      Size(412, 915),
      24,
      16,
    ),
    (
      'Android gesture navigation, thin handle',
      TargetPlatform.android,
      Size(360, 800),
      16,
      16,
    ),
    (
      'Android 3-button navigation',
      TargetPlatform.android,
      Size(360, 800),
      48,
      48 + 16,
    ),
    ('Android without an inset', TargetPlatform.android, Size(360, 640), 0, 16),
  ];

  for (final (name, platform, size, inset, gap) in phones) {
    testWidgets('new-chat button position ($name)', (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      tester.view.viewPadding = FakeViewPadding(bottom: inset);
      tester.view.padding = FakeViewPadding(bottom: inset);
      addTearDown(tester.view.reset);
      final t = L10nTranslator(language: AppLanguage.ru, cache: const {});
      await tester.pumpWidget(
        uxApp(
          // The shell strips the bottom inset from its pages.
          Builder(
            builder: (context) {
              final media = MediaQuery.of(context);
              return MediaQuery(
                data: media.copyWith(
                  padding: media.padding.copyWith(bottom: 0),
                  viewPadding: media.viewPadding.copyWith(bottom: 0),
                ),
                child: const InboxScreen(),
              );
            },
          ),
          theme: AppTheme.light().copyWith(platform: platform),
          size: size,
          disableAnimations: true,
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
      expect(size.height - fab.bottom, closeTo(gap, 0.5));
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(minutes: 5));
    });
  }
}
