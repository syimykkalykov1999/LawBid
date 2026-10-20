import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/blocks/application/blocks_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/chat_saved_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/conversation_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/team/application/team_providers.dart';

import '../features/chat/contact_info_test.dart' show FakeContactChat, makeConv;
import '../helpers/long_locale.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-20: the long-press menu, the reply bar, the pin banner,
/// «Прочитано · HH:MM», «Переслано» and the reaction chips must fit a
/// 360 dp phone in the longest texts, right-to-left, Nepali, Arabic and
/// Russian (x1.0 and x1.1), and every menu row must stay reachable.
class _Chat extends FakeContactChat {
  _Chat(super.conv);

  late List<ChatMessage> pinned;

  @override
  Future<ChatPins> pins(String id) async => ChatPins(
        items: pinned,
        editWindowMin: 15,
        deleteForAllHours: 48,
        maxPins: 3,
      );
}

void main() {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
  setUpAll(initializeDateFormatting);

  final locales = <String, (Translator, TextDirection)>{
    'longest': (LongestTranslator(), TextDirection.ltr),
    'longest rtl': (LongestTranslator(), TextDirection.rtl),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
  };

  final now = DateTime.now();
  final mine = ChatMessage(
    id: 'm1',
    conversationId: 'c1',
    senderId: 'me',
    kind: MessageKind.text,
    body: 'Please send the signed contract and the passport scan today',
    createdAt: now.subtract(const Duration(minutes: 3)),
    editedAt: now.subtract(const Duration(minutes: 1)),
    pinned: true,
    replyTo: const ReplyPreview(
      id: 'm0',
      senderId: 'u2',
      kind: MessageKind.text,
      snippet:
          'The hearing is moved to the next Thursday at nine in the morning',
    ),
  );
  final theirs = ChatMessage(
    id: 'm2',
    conversationId: 'c1',
    senderId: 'u2',
    kind: MessageKind.text,
    body: 'Forwarded from the court clerk about the filing deadline',
    createdAt: now.subtract(const Duration(minutes: 2)),
    forwarded: true,
    reactions: const [
      MessageReaction(emoji: '👍', count: 2, mine: true),
    ],
  );

  for (final scale in [1.0, 1.1]) {
    for (final e in locales.entries) {
      testWidgets('chat menu, reply bar, banner: ${e.key} x$scale',
          (tester) async {
        final (t, dir) = e.value;
        useNarrowPhone(tester);
        final c0 = makeConv(caseId: 'k1', caseTitle: 'Case');
        final chat = _Chat(
          Conversation(
            id: c0.id,
            caseId: c0.caseId,
            caseTitle: c0.caseTitle,
            status: c0.status,
            contactsUnlocked: true,
            counterpart: c0.counterpart,
            unreadCount: 0,
            updatedAt: c0.updatedAt,
            counterpartLastReadId: 'm1',
            counterpartLastReadAt: now.subtract(const Duration(minutes: 1)),
          ),
        )
          ..textMessages.addAll([mine, theirs])
          ..pinned = [mine];
        final router = GoRouter(
          routes: [
            GoRoute(
              path: '/',
              builder: (_, __) => Directionality(
                textDirection: dir,
                child: const ConversationScreen(conversationId: 'c1'),
              ),
            ),
          ],
        );
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              ...uxOverrides(translator: t),
              chatRepositoryProvider.overrideWithValue(chat),
              currentUserIdProvider.overrideWithValue('me'),
              realtimeClientProvider.overrideWithValue(null),
              actsAsAttorneyProvider.overrideWithValue(false),
              blockedIdsProvider.overrideWith((ref) async => <String>{}),
              savedChatIdsProvider.overrideWith(_NoSaved.new),
            ],
            child: MaterialApp.router(
              theme: AppTheme.light(),
              routerConfig: router,
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context)
                    .copyWith(textScaler: TextScaler.linear(scale)),
                child: child!,
              ),
            ),
          ),
        );
        await tester.pump(const Duration(milliseconds: 300));
        await tester.pump(const Duration(milliseconds: 300));
        expect(tester.takeException(), isNull, reason: 'chat screen');

        // The menu of my own, read, edited, pinned, quoting message.
        await tester.longPress(find.textContaining('signed contract').last);
        await tester.pump(const Duration(milliseconds: 400));
        expect(tester.takeException(), isNull, reason: 'menu');
        expect(find.byKey(const ValueKey('msg-read-at')), findsOneWidget);
        final del = find.byKey(const ValueKey('msg-act-delete'));
        await tester.ensureVisible(del);
        await tester.pump();
        expect(tester.getRect(del).bottom, lessThanOrEqualTo(780));

        // Reply: the bar shows the quote and the field is focused.
        final reply = find.byKey(const ValueKey('msg-act-reply'));
        await tester.ensureVisible(reply);
        await tester.tap(reply);
        await tester.pump(const Duration(milliseconds: 400));
        expect(tester.takeException(), isNull, reason: 'reply bar');
        final bar = find.byKey(const ValueKey('reply-bar'));
        expect(bar, findsOneWidget);
        expect(
          find.descendant(
            of: bar,
            matching: find.textContaining('signed contract'),
          ),
          findsOneWidget,
        );
        expect(tester.getSize(bar).height, greaterThan(24));
        expect(
          FocusManager.instance.primaryFocus?.context
              ?.findAncestorWidgetOfExactType<TextField>(),
          isNotNull,
          reason: 'the field has the focus',
        );
        await tester.pumpWidget(const SizedBox());
        await tester.pump(const Duration(seconds: 1));
      });
    }
  }
}

/// No saved messages, no network.
class _NoSaved extends SavedChatIdsNotifier {
  @override
  Future<Set<String>> build() async => <String>{};
}
