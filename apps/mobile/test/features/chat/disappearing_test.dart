// ignore_for_file: lines_longer_than_80_chars
import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/blocks/application/blocks_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/domain/disappearing.dart';
import 'package:lawbid/features/chat/presentation/contact_info_screen.dart';
import 'package:lawbid/features/chat/presentation/conversation_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/team/application/team_providers.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';
import 'contact_info_test.dart';

/// Owner 2026-10-21 (WhatsApp «Disappearing messages»).
Conversation _conv({int? after, String? caseId}) {
  final base = makeConv(caseId: caseId, caseTitle: caseId == null ? null : 'K');
  return Conversation(
    id: base.id,
    caseId: base.caseId,
    caseTitle: base.caseTitle,
    status: base.status,
    contactsUnlocked: base.contactsUnlocked,
    counterpart: base.counterpart,
    unreadCount: 0,
    updatedAt: base.updatedAt,
    isDirect: caseId == null,
    disappearAfterS: after,
  );
}

class _Chat extends FakeContactChat {
  _Chat(super.conv);

  int? lastSet;

  @override
  Future<Conversation> setDisappearing(String id, int? afterS) async {
    lastSet = afterS;
    return conv = _conv(after: afterS);
  }
}

ChatMessage _msg(
  String id,
  String body, {
  DateTime? expiresAt,
  MessageKind kind = MessageKind.text,
  String? senderId = 'u2',
}) =>
    ChatMessage(
      id: id,
      conversationId: 'c1',
      kind: kind,
      body: body,
      senderId: senderId,
      createdAt: DateTime(2026, 10, 21, 10),
      expiresAt: expiresAt,
    );

void _test(String name, Future<void> Function(WidgetTester) body) {
  testWidgets(name, (tester) async {
    await body(tester);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });
}

void main() {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
  setUpAll(initializeDateFormatting);
  // The composer builds a recorder; the real-time wait below lets its
  // platform call surface, so answer it.
  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel('com.llfbandit.record/messages'),
      (_) async => null,
    );
  });

  group('model', () {
    test('a message is gone once its time has passed', () {
      final now = DateTime(2026, 10, 21, 12);
      expect(_msg('a', 'x').isExpired(now), isFalse);
      expect(
        _msg('a', 'x', expiresAt: now.add(const Duration(minutes: 1)))
            .isExpired(now),
        isFalse,
      );
      expect(
        _msg('a', 'x', expiresAt: now.subtract(const Duration(seconds: 1)))
            .isExpired(now),
        isTrue,
      );
      expect(_msg('a', 'x', expiresAt: now).isExpired(now), isTrue);
    });

    test('the service line names who switched it and the timer', () {
      const t = StaticTranslatorRu();
      expect(isDisappearLine('disappear:604800'), isTrue);
      expect(isDisappearLine('disappear_off'), isTrue);
      expect(isDisappearLine('offer_accepted'), isFalse);
      expect(
        disappearLineText(t, 'disappear:604800', name: 'Анна'),
        'Анна: исчезающие сообщения включены · 7 дней',
      );
      expect(
        disappearLineText(t, 'disappear_off', name: 'Анна'),
        'Анна: исчезающие сообщения выключены',
      );
      expect(disappearValue(t, null), 'Выкл.');
      expect(disappearValue(t, 86400), '24 часа');
      expect(disappearValue(t, 7776000), '90 дней');
    });
  });

  _test('«Данные контакта»: the timer row opens the picker and saves',
      (tester) async {
    final chat = _Chat(_conv());
    await pumpContact(
      tester,
      contactTestApp(
        chat,
        const ContactInfoScreen(conversationId: 'c1'),
        pushed: [],
      ),
    );
    final row = find.byKey(const ValueKey('contact-disappearing'));
    await tester.ensureVisible(row);
    expect(find.text('Исчезающие сообщения'), findsOneWidget);
    expect(
      find.descendant(of: row, matching: find.text('Выкл.')),
      findsOneWidget,
    );
    await tester.tap(row);
    await tester.pumpAndSettle();
    await tester.tap(find.text('7 дней'));
    await tester.pumpAndSettle();
    expect(chat.lastSet, 604800);
    expect(
      find.descendant(of: row, matching: find.text('7 дней')),
      findsOneWidget,
    );

    // Off again.
    await tester.tap(row);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Выкл.').hitTestable().last);
    await tester.pumpAndSettle();
    expect(chat.lastSet, isNull);
  });

  _test('a case chat has no timer row', (tester) async {
    final chat = _Chat(_conv(caseId: 'k1'));
    await pumpContact(
      tester,
      contactTestApp(
        chat,
        const ContactInfoScreen(conversationId: 'c1'),
        pushed: [],
      ),
    );
    expect(find.byKey(const ValueKey('contact-disappearing')), findsNothing);
  });

  _test('the chat hides expired messages, shows the line and a timer mark',
      (tester) async {
    final chat = _Chat(_conv(after: 604800))
      ..textMessages.addAll([
        _msg(
          'old',
          'already gone',
          expiresAt: DateTime.now().subtract(const Duration(minutes: 1)),
        ),
        _msg(
          'live',
          'still here',
          expiresAt: DateTime.now().add(const Duration(days: 1)),
        ),
        _msg(
          'line',
          'disappear:604800',
          kind: MessageKind.system,
        ),
      ]);
    await pumpContact(
      tester,
      contactTestApp(
        chat,
        const ConversationScreen(conversationId: 'c1'),
        pushed: [],
      ),
    );
    expect(find.text('already gone'), findsNothing);
    expect(find.text('still here'), findsOneWidget);
    expect(
      find.text('Anna Kowalski: исчезающие сообщения включены · 7 дней'),
      findsOneWidget,
    );
    expect(find.byKey(const ValueKey('chat-header-timer')), findsOneWidget);
  });

  _test('a message disappears on screen when its time comes', (tester) async {
    final chat = _Chat(_conv(after: 86400))
      ..textMessages.add(
        _msg(
          'soon',
          'bye soon',
          expiresAt: DateTime.now().add(const Duration(seconds: 3)),
        ),
      );
    await pumpContact(
      tester,
      contactTestApp(
        chat,
        const ConversationScreen(conversationId: 'c1'),
        pushed: [],
      ),
    );
    expect(find.text('bye soon'), findsOneWidget);
    // The widget clock is fake, DateTime.now() is real: let both pass.
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 3200)),
    );
    await tester.pump(const Duration(seconds: 4));
    await tester.pump();
    expect(find.text('bye soon'), findsNothing);
  });

  // The timer row and its picker at 360 dp, text x1.1, in the longest texts.
  for (final entry in <String, (Translator, TextDirection)>{
    'longest': (LongestTranslator(), TextDirection.ltr),
    'longest rtl': (LongestTranslator(), TextDirection.rtl),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
    'de': (ShippedTranslator('de'), TextDirection.ltr),
    'mr': (ShippedTranslator('mr'), TextDirection.ltr),
  }.entries) {
    testWidgets('no overflow at 360 dp (${entry.key})', (tester) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final chat = _Chat(_conv(after: 7776000));
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ...uxOverrides(translator: entry.value.$1),
            chatRepositoryProvider.overrideWithValue(chat),
            currentUserIdProvider.overrideWithValue('me'),
            realtimeClientProvider.overrideWithValue(null),
            actsAsAttorneyProvider.overrideWithValue(false),
            blockedIdsProvider.overrideWith((ref) async => <String>{}),
          ],
          child: MaterialApp(
            theme: AppTheme.light(),
            builder: (context, child) => Directionality(
              textDirection: entry.value.$2,
              child: MediaQuery(
                data: MediaQuery.of(context)
                    .copyWith(textScaler: const TextScaler.linear(1.1)),
                child: child!,
              ),
            ),
            home: const ContactInfoScreen(conversationId: 'c1'),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 200));
      await tester.pump(const Duration(milliseconds: 200));
      final row = find.byKey(const ValueKey('contact-disappearing'));
      await tester.ensureVisible(row);
      await tester.pump();
      await tester.tap(row);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 1));
    });
  }
}
