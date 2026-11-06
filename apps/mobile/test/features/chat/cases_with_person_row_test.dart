import 'dart:async';

import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/conversation_screen.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import 'contact_info_test.dart';

/// R-404 (b): inside the direct chat, «Cases with this person (N)» under
/// the header — only when N > 0 — opens the list of those case chats.
class _Chat extends FakeContactChat {
  _Chat(super.conv, this.rows);

  final List<Conversation> rows;

  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) async =>
      CursorPage(items: rows);
}

Conversation _case(String id, String with_) => Conversation(
      id: id,
      caseId: 'case-$id',
      caseTitle: 'Case $id',
      status: ConversationStatus.active,
      contactsUnlocked: true,
      counterpart: Counterpart(
        isAttorney: true,
        verified: true,
        id: with_,
        displayName: 'Anna Kowalski',
      ),
      unreadCount: 0,
      updatedAt: DateTime(2026),
      lastMessageAt: DateTime(2026),
    );

class _Inbox extends ConsumerWidget {
  const _Inbox();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(conversationsProvider);
    return Scaffold(body: Text(list.hasValue ? 'inbox ready' : 'inbox'));
  }
}

Conversation _direct() => Conversation(
      id: 'c1',
      caseId: null,
      caseTitle: null,
      status: ConversationStatus.active,
      contactsUnlocked: true,
      counterpart: const Counterpart(
        isAttorney: true,
        verified: true,
        id: 'u2',
        displayName: 'Anna Kowalski',
        username: 'anna',
      ),
      unreadCount: 0,
      updatedAt: DateTime(2026),
      isDirect: true,
    );

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

  Future<void> open(WidgetTester tester, _Chat chat) async {
    await pumpContact(
      tester,
      contactTestApp(
        chat,
        const _Inbox(),
        pushed: [],
        extra: [messageStoreProvider.overrideWithValue(null)],
      ),
    );
    expect(find.text('inbox ready'), findsOneWidget);
    unawaited(
      Navigator.of(tester.element(find.text('inbox ready'))).push(
        MaterialPageRoute<void>(
          builder: (_) => const ConversationScreen(conversationId: 'c1'),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
  }

  testWidgets('the row counts the case chats with this person and lists them',
      (tester) async {
    final direct = _direct();
    final chat = _Chat(direct, [
      direct,
      _case('k1', 'u2'),
      _case('k2', 'u2'),
      _case('k9', 'someone-else'),
    ]);
    await open(tester, chat);
    final row = find.byKey(const ValueKey('chat-cases-with-person'));
    expect(row, findsOneWidget);
    expect(find.text('Кейсы с этим человеком (2)'), findsOneWidget);

    await tester.tap(row);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('chat-case-with-k1')), findsOneWidget);
    expect(find.byKey(const ValueKey('chat-case-with-k2')), findsOneWidget);
    expect(find.byKey(const ValueKey('chat-case-with-k9')), findsNothing);
    expect(find.byType(ConversationRow), findsNWidgets(2));
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });

  testWidgets('no case chats with this person: no row', (tester) async {
    final direct = _direct();
    final chat = _Chat(direct, [direct, _case('k9', 'someone-else')]);
    await open(tester, chat);
    expect(find.byType(ConversationScreen), findsOneWidget);
    expect(find.byKey(const ValueKey('chat-cases-with-person')), findsNothing);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });
}
