import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_bubble_parts.dart';
import 'package:lawbid/features/chat/presentation/conversation_screen.dart';

import 'contact_info_test.dart';

/// Audit 26.10 W5 (Telegram / WhatsApp): the floating date never shows the
/// same day twice — while the day's own chip in the list is on screen the
/// floating one stays hidden.
List<ChatMessage> _history(int n) => [
      for (var i = n - 1; i >= 0; i--)
        ChatMessage(
          id: 'm$i',
          conversationId: 'c1',
          kind: MessageKind.text,
          body: 'message $i',
          senderId: i.isEven ? 'u2' : 'me',
          createdAt: DateTime(2026, 10).add(Duration(hours: i * 3)),
        ),
    ];

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

  testWidgets('the floating date and the list chip never show one day twice',
      (tester) async {
    final chat = FakeContactChat(makeConv())..textMessages.addAll(_history(60));
    await pumpContact(
      tester,
      contactTestApp(
        chat,
        const ConversationScreen(conversationId: 'c1'),
        pushed: [],
      ),
    );
    final list = find.byType(Scrollable).first;
    final view = tester.getRect(list);
    final sticky = find.byKey(const ValueKey('sticky-date'));
    final gesture = await tester.startGesture(view.center);
    var dupes = 0;
    var shown = 0;
    for (var step = 0; step < 120; step++) {
      await gesture.moveBy(const Offset(0, 15));
      await tester.pump(const Duration(milliseconds: 16));
      if (sticky.evaluate().isEmpty) continue;
      final fade = tester.widget<AnimatedOpacity>(
        find.ancestor(of: sticky, matching: find.byType(AnimatedOpacity)),
      );
      if (fade.opacity == 0) continue;
      shown++;
      final label = tester.widget<ChatDateChip>(sticky).label;
      for (final e in find.byType(ChatDateChip).evaluate()) {
        final chip = e.widget as ChatDateChip;
        if (chip.key == const ValueKey('sticky-date')) continue;
        if (chip.label != label) continue;
        final r = tester.getRect(find.byWidget(chip));
        if (r.bottom > view.top && r.top < view.bottom) dupes++;
      }
    }
    await gesture.up();
    expect(shown, greaterThan(0));
    expect(dupes, 0);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 2));
  });
}
