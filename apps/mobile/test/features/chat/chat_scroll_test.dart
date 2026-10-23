// ignore_for_file: lines_longer_than_80_chars
import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_list_controller.dart';
import 'package:lawbid/features/chat/presentation/conversation_screen.dart';

import 'contact_info_test.dart';

/// Owner 2026-10-22 (WhatsApp / Telegram): the round "down" pill once the
/// person scrolled away from the newest message, a date chip that follows
/// the scroll, and a tap on a quoted message jumps to the original.
List<ChatMessage> _history(int n) => [
      // Newest first, like the server's page.
      for (var i = n - 1; i >= 0; i--)
        ChatMessage(
          id: 'm$i',
          conversationId: 'c1',
          kind: MessageKind.text,
          body: 'message $i',
          senderId: i.isEven ? 'u2' : 'me',
          createdAt: DateTime(2026, 10, 1).add(Duration(hours: i * 3)),
          replyTo: i == n - 1
              ? const ReplyPreview(
                  id: 'm0',
                  kind: MessageKind.text,
                  snippet: 'the very first words',
                  senderId: 'u2',
                )
              : null,
        ),
    ];

void _test(String name, Future<void> Function(WidgetTester) body) {
  testWidgets(name, (tester) async {
    await body(tester);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 2));
  });
}

Future<_Open> _open(WidgetTester tester) async {
  final chat = FakeContactChat(makeConv())..textMessages.addAll(_history(60));
  await pumpContact(
    tester,
    contactTestApp(
      chat,
      const ConversationScreen(conversationId: 'c1'),
      pushed: [],
    ),
  );
  return _Open(tester);
}

class _Open {
  _Open(this.tester);

  final WidgetTester tester;

  ScrollToBottomPill get pill =>
      tester.widget<ScrollToBottomPill>(find.byType(ScrollToBottomPill));

  Finder get list => find.byType(Scrollable).first;

  Future<void> scrollUp(double px) async {
    await tester.drag(list, Offset(0, px));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 400));
  }
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

  _test('the down pill shows after scrolling up and takes you back',
      (tester) async {
    final o = await _open(tester);
    expect(o.pill.visible, isFalse);
    await o.scrollUp(600);
    await o.scrollUp(600);
    expect(o.pill.visible, isTrue);
    await tester.tap(find.byKey(const ValueKey('scroll-to-bottom')));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(milliseconds: 500));
    expect(o.pill.visible, isFalse);
  });

  _test('a date chip follows the scroll and fades out when it stops',
      (tester) async {
    final o = await _open(tester);
    await o.scrollUp(500);
    final chip = find.byKey(const ValueKey('sticky-date'));
    expect(chip, findsOneWidget);
    // It is the day of a message near the top edge.
    expect(
      find.descendant(of: chip, matching: find.byType(Text)),
      findsOneWidget,
    );
    final fade = find.ancestor(
      of: chip,
      matching: find.byType(AnimatedOpacity),
    );
    await tester.pump(const Duration(milliseconds: 1500));
    await tester.pump(const Duration(milliseconds: 400));
    expect(tester.widget<AnimatedOpacity>(fade.first).opacity, 0);
  });

  _test('a tap on the quote jumps to the original message', (tester) async {
    final o = await _open(tester);
    // The newest message quotes the oldest; the oldest is far above.
    expect(find.text('message 0'), findsNothing);
    await tester.tap(find.text('the very first words'));
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.text('message 0'), findsOneWidget);
    expect(o.pill.visible, isTrue);
  });
}
