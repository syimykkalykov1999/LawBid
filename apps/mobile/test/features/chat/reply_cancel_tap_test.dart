import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/conversation_screen.dart';
import 'package:material_ui/material_ui.dart';

import 'contact_info_test.dart';

/// Owner row 90 (2026-11-13), on the real chat screen: swipe «ответить»
/// on a message → the reply bar opens → ✕ → a plain tap on a message (the
/// swiped one or any other) opened «ответить» again.
///
/// Proven cause (old `reply_swipe.dart`, f887d6f03): `_fired` stayed true
/// after a swipe reply, and the drag recogniser's `onCancel` — which runs
/// on every plain tap — called `_release`, which quoted while `_fired` was
/// true. Fixed in #1023; this test keeps it fixed on the whole screen.
List<ChatMessage> _history() => [
      for (var i = 5; i >= 0; i--)
        ChatMessage(
          id: 'm$i',
          conversationId: 'c1',
          kind: MessageKind.text,
          body: 'message $i',
          senderId: i.isEven ? 'u2' : 'me',
          createdAt: DateTime(2026, 11).add(Duration(minutes: i)),
        ),
    ];

final _bar = find.byKey(const ValueKey('reply-bar'));

Future<void> _swipe(WidgetTester tester, String text) async {
  final g = await tester.startGesture(tester.getCenter(find.text(text)));
  for (var i = 0; i < 10; i++) {
    await g.moveBy(const Offset(-15, 0.5));
    await tester.pump(const Duration(milliseconds: 16));
  }
  await g.up();
  await tester.pumpAndSettle();
}

Future<void> _tap(WidgetTester tester, String text) async {
  await tester.tap(find.text(text));
  // Past the double-tap window, so the tap is a plain tap.
  await tester.pump(const Duration(milliseconds: 400));
  await tester.pumpAndSettle();
}

void main() {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
  setUpAll(initializeDateFormatting);
  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel('com.llfbandit.record/messages'),
      (_) async => null,
    );
  });

  testWidgets('row 90: after ✕ on the reply bar no tap opens «reply» again',
      (tester) async {
    final chat = FakeContactChat(makeConv())..textMessages.addAll(_history());
    await pumpContact(
      tester,
      contactTestApp(
        chat,
        const ConversationScreen(conversationId: 'c1'),
        pushed: [],
      ),
    );
    expect(_bar, findsNothing);

    // Two swiped messages, each closed with ✕ (the owner quoted several).
    for (final swiped in ['message 4', 'message 3']) {
      await _swipe(tester, swiped);
      expect(_bar, findsOneWidget, reason: 'swipe on $swiped quotes it');
      await tester.tap(
        find.descendant(of: _bar, matching: find.byType(AppIconButton)),
      );
      await tester.pumpAndSettle();
      expect(_bar, findsNothing, reason: '✕ closes the reply bar');
    }

    for (final m in ['message 4', 'message 3', 'message 2', 'message 5']) {
      await _tap(tester, m);
      expect(_bar, findsNothing, reason: 'a tap on $m must not quote');
    }

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 2));
  });
}
