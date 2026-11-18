import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/conversation_screen.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:material_ui/material_ui.dart';

import 'contact_info_test.dart';

/// Row 110 (Telegram 🔍 in a chat): menu → «Поиск» → the field takes the
/// top bar, «N из M» and ↑ / ↓ take the composer's place; ↑ walks to an
/// older hit; the arrow back closes the search and brings the composer.
class _SearchChat extends FakeContactChat {
  _SearchChat(super.conv);

  final asked = <String>[];

  @override
  Future<CursorPage<ChatMessage>> searchMessages(
    String id,
    String q, {
    String? cursor,
  }) async {
    asked.add(q);
    final words = q.toLowerCase().split(' ');
    return CursorPage(
      items: [
        for (final m in textMessages)
          if (words.every((w) => m.body.toLowerCase().contains(w))) m,
      ],
    );
  }
}

List<ChatMessage> _history() => [
      for (var i = 5; i >= 0; i--)
        ChatMessage(
          id: 'm$i',
          conversationId: 'c1',
          kind: MessageKind.text,
          body: i.isEven ? 'invoice number $i' : 'hello $i',
          senderId: i.isEven ? 'u2' : 'me',
          createdAt: DateTime(2026, 11).add(Duration(minutes: i)),
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

  testWidgets('row 110: search inside a chat with ↑ / ↓', (tester) async {
    final chat = _SearchChat(makeConv())..textMessages.addAll(_history());
    await pumpContact(
      tester,
      contactTestApp(
        chat,
        const ConversationScreen(conversationId: 'c1'),
        pushed: [],
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel('Действия с чатом').first);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('chat-menu-search')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('in-chat-search-field')), findsOneWidget);
    // The composer steps aside for the search bar.
    expect(find.byKey(const ValueKey('in-chat-search-count')), findsOneWidget);

    await tester.enterText(
      find.byKey(const ValueKey('in-chat-search-field')),
      'invoice',
    );
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(chat.asked, ['invoice']);
    expect(find.text('1 из 3'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('in-chat-search-older')));
    await tester.pumpAndSettle();
    expect(find.text('2 из 3'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('in-chat-search-newer')));
    await tester.pumpAndSettle();
    expect(find.text('1 из 3'), findsOneWidget);

    await tester.enterText(
      find.byKey(const ValueKey('in-chat-search-field')),
      'nothing here',
    );
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(find.text('Ничего не найдено'), findsOneWidget);

    // Back closes the search; the composer is back.
    await tester.tap(find.bySemanticsLabel('Назад').first);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('in-chat-search-field')), findsNothing);
    expect(find.byType(TextField), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 2));
  });
}
