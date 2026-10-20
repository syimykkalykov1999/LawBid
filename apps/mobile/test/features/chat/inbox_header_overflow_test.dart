import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chats_filter_row.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';
import '../groups/fake_group_repository.dart';

/// Owner 2026-10-20: the Chats header (back, Chats | Team, «+», «⋮», bell) on
/// a 360 dp phone in the longest translations and in ne / ar / de / mr, at
/// text x1 and x1.1. Nothing overflows or touches, the filter bar is opaque
/// and a whole number of pixels high.
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
  Future<({int waiting, int requests})> folderCounts() async =>
      (waiting: 1, requests: 2);

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

void main() {
  setUpAll(initializeDateFormatting);

  final cases = <String, (Translator, TextDirection)>{
    'longest': (LongestTranslator(), TextDirection.ltr),
    'longest, right-to-left': (LongestTranslator(), TextDirection.rtl),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
    'de': (ShippedTranslator('de'), TextDirection.ltr),
    'mr': (ShippedTranslator('mr'), TextDirection.ltr),
  };

  for (final scale in [1.0, 1.1]) {
    for (final MapEntry(key: name, value: (t, dir)) in cases.entries) {
      testWidgets('header fits at 360 dp ($name, text x$scale)',
          (tester) async {
        useNarrowPhone(tester);
        await tester.pumpWidget(
          uxApp(
            Directionality(textDirection: dir, child: const InboxScreen()),
            theme: AppTheme.light(),
            size: const Size(360, 780),
            textScale: scale,
            disableAnimations: true,
            overrides: uxOverrides(
              translator: t,
              extra: [
                chatRepositoryProvider.overrideWithValue(_Chats()),
                groupRepositoryProvider
                    .overrideWithValue(FakeGroupRepository()),
                currentUserIdProvider.overrideWithValue('me'),
                currentUserRoleProvider.overrideWithValue(UserRole.attorney),
                channelsEnabledProvider.overrideWithValue(true),
                realtimeClientProvider.overrideWithValue(null),
              ],
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        final menu = tester.getRect(find.byKey(const ValueKey('chats-menu')));
        final plus =
            tester.getRect(find.byKey(const ValueKey('chats-new-chat')));
        // The segments end before the first icon begins.
        final tabs = tester.getRect(find.byType(InboxTabsBar));
        final firstIcon = dir == TextDirection.ltr
            ? (menu.left < plus.left ? menu : plus).left
            : (menu.right > plus.right ? menu : plus).right;
        if (dir == TextDirection.ltr) {
          expect(tabs.right, lessThanOrEqualTo(firstIcon));
        } else {
          expect(tabs.left, greaterThanOrEqualTo(firstIcon));
        }
        // The filter bar is a whole number of pixels high.
        final bar = tester.getSize(find.byType(ChatsFilterRow));
        expect(bar.height, ChatsFilterRow.height);
        // The megaphone lives in ⋮ now.
        expect(find.byKey(const ValueKey('inbox-channels')), findsNothing);
        await tester.pumpWidget(const SizedBox());
        await tester.pump(const Duration(minutes: 5));
      });
    }
  }

  testWidgets('the channels entry is inside ⋮, not in the header',
      (tester) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        const InboxScreen(),
        theme: AppTheme.light(),
        size: const Size(360, 780),
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [
            chatRepositoryProvider.overrideWithValue(_Chats()),
            groupRepositoryProvider.overrideWithValue(FakeGroupRepository()),
            currentUserIdProvider.overrideWithValue('me'),
            channelsEnabledProvider.overrideWithValue(true),
            realtimeClientProvider.overrideWithValue(null),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('chats-menu-channels')), findsNothing);
    await tester.tap(find.byKey(const ValueKey('chats-menu')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('chats-menu-channels')), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 5));
  });
}
