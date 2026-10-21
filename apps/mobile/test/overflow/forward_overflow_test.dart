import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/forward_sheet.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_settings.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_message_bubble.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_selection_bar.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../features/groups/fake_group_repository.dart';
import '../helpers/long_locale.dart';
import '../helpers/pending_strings.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-21 (Telegram «Переслать» + «Запретить копирование»): the
/// «Forward to…» sheet, the group selection bar, a forwarded group bubble
/// and the protect-content switch on a 360 dp phone — longest text of every
/// language (also right-to-left), Nepali, Arabic, Russian; text ×1 and
/// ×1.1; all four themes. Nothing may overflow or leave the screen.
class _Chats implements ChatRepository {
  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) async =>
      CursorPage(
        items: [
          for (final (i, closed) in [(1, false), (2, true)])
            Conversation(
              id: 'c$i',
              caseId: null,
              caseTitle: null,
              status: closed
                  ? ConversationStatus.closed
                  : ConversationStatus.active,
              isDirect: true,
              contactsUnlocked: true,
              counterpart: const Counterpart(
                id: 'u',
                displayName:
                    'Konstantinopolsky-Vasilevsky Alexandrovich Bartholomew',
                isAttorney: true,
                verified: true,
              ),
              unreadCount: 0,
              updatedAt: DateTime(2026),
            ),
        ],
      );

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

void main() {
  setUpAll(initializeDateFormatting);

  final ru = L10nTranslator(language: AppLanguage.ru, cache: const {});
  final locales = <String, (Translator, TextDirection)>{
    'longest': (withPending(LongestTranslator(), null), TextDirection.ltr),
    'longest rtl': (withPending(LongestTranslator(), null), TextDirection.rtl),
    'ne': (withPending(ShippedTranslator('ne'), 'ne'), TextDirection.ltr),
    'ar': (withPending(ShippedTranslator('ar'), 'ar'), TextDirection.rtl),
    'ru': (withPending(ru, 'ru'), TextDirection.ltr),
  };
  final themes = {
    for (final id in AppThemeId.values) id.name: AppTheme.of(id),
  };

  for (final scale in [1.0, 1.1]) {
    for (final MapEntry(key: lang, value: (t, dir)) in locales.entries) {
      for (final MapEntry(key: themeName, value: theme) in themes.entries) {
        final tag = '$lang, $themeName, x$scale';

        Future<void> pump(WidgetTester tester, Widget child) async {
          useNarrowPhone(tester);
          await tester.pumpWidget(
            uxApp(
              Directionality(textDirection: dir, child: child),
              theme: theme,
              size: narrowPhone,
              textScale: scale,
              disableAnimations: true,
              overrides: uxOverrides(
                translator: t,
                extra: [
                  chatRepositoryProvider.overrideWithValue(_Chats()),
                  groupRepositoryProvider.overrideWithValue(
                    FakeGroupRepository([
                      listGroup('g1'),
                      listGroup('g2', canPost: false),
                    ]),
                  ),
                  channelsEnabledProvider.overrideWithValue(false),
                  currentUserIdProvider.overrideWithValue('me'),
                ],
              ),
            ),
          );
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 300));
        }

        Future<void> end(WidgetTester tester) async {
          await tester.pumpWidget(const SizedBox());
          await tester.pump(const Duration(minutes: 6));
        }

        testWidgets('forward sheet fits: $tag', (tester) async {
          await pump(
            tester,
            Scaffold(
              body: Consumer(
                builder: (context, ref, _) => TextButton(
                  onPressed: () => forwardWithSheet(context, ref, const []),
                  child: const Text('noop'),
                ),
              ),
              bottomSheet: const SizedBox(
                height: 640,
                child: ForwardTargetSheet(),
              ),
            ),
          );
          await tester.tap(find.byKey(const ValueKey('forward-group-g1')));
          await tester.pump();
          expect(tester.takeException(), isNull);
          expect(find.byKey(const ValueKey('forward-send')), findsOneWidget);
          await end(tester);
        });

        testWidgets('group selection bar fits: $tag', (tester) async {
          await pump(
            tester,
            Scaffold(
              appBar: GroupSelectionBar(
                count: 128,
                onClose: () {},
                onCopy: () {},
                onForward: () {},
              ),
              body: const SizedBox.expand(),
            ),
          );
          expect(tester.takeException(), isNull);
          for (final k in ['group-select-copy', 'group-select-forward']) {
            final r = tester.getRect(find.byKey(ValueKey(k)));
            expect(r.left, greaterThanOrEqualTo(0), reason: k);
            expect(r.right, lessThanOrEqualTo(360), reason: k);
          }
          await end(tester);
        });

        testWidgets('protected bar and forwarded bubble fit: $tag',
            (tester) async {
          await pump(
            tester,
            Scaffold(
              appBar: GroupSelectionBar(
                count: 3,
                onClose: () {},
                onShareLink: () {},
              ),
              body: ListView(
                children: [
                  for (final mine in [false, true])
                    GroupMessageBubble(
                      message: message(
                        'f$mine',
                        body: 'Ok',
                        mine: mine,
                        forwardedFrom: 'Konstantinopolsky-Vasilevsky '
                            'Alexandrovich Bartholomew',
                      ),
                      groupId: 'g1',
                      showName: true,
                      showAvatar: true,
                      canClose: false,
                      highlighted: false,
                      selected: mine,
                      onMenu: () {},
                      onPollChanged: (_) {},
                    ),
                ],
              ),
            ),
          );
          expect(tester.takeException(), isNull);
          expect(
            find.byKey(const ValueKey('group-forwarded')),
            findsNWidgets(2),
          );
          await end(tester);
        });

        testWidgets('protect-content switch fits: $tag', (tester) async {
          await pump(
            tester,
            Scaffold(
              body: ListView(
                children: [
                  GroupInfoSettings(
                    detail: groupDetail(protectContent: true),
                    update: (_) async => null,
                    onError: (_) {},
                  ),
                ],
              ),
            ),
          );
          await tester.scrollUntilVisible(
            find.byKey(const ValueKey('group-set-protect')),
            200,
          );
          expect(tester.takeException(), isNull);
          await end(tester);
        });
      }
    }
  }
}
