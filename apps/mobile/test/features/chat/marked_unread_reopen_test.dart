import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/features/chat/application/chat_list_delta.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/conversation_screen.dart';
import 'package:material_ui/material_ui.dart';

import 'contact_info_test.dart';

/// Row 110 review (14.11): «Отметить как непрочитанное», then the chat is
/// opened again in the same session with no new message. The read must
/// still go to the server (it is what takes the mark off there), and the
/// list row must lose the pill and leave the «Непрочитанные» filter.
class _Chat extends FakeContactChat {
  _Chat(super.conv);

  final reads = <String>[];

  @override
  Future<void> read(String id, String lastReadMessageId) async {
    reads.add(lastReadMessageId);
    conv = conv.withActivity(markedUnread: false);
  }
}

Conversation _marked() => Conversation(
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
      ),
      unreadCount: 0,
      updatedAt: DateTime(2026),
      markedUnread: true,
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

  test('a read takes my own unread mark off the list row', () {
    final rows = applyReadByMe([_marked()], 'c1');
    expect(rows, isNotNull, reason: 'the marked row must change');
    expect(rows!.single.markedUnread, isFalse);
    expect(rows.single.hasUnread, isFalse);
  });

  testWidgets('marked unread after a read: opening it reads again',
      (tester) async {
    final chat = _Chat(_marked())
      ..textMessages.add(
        ChatMessage(
          id: 'm1',
          conversationId: 'c1',
          kind: MessageKind.text,
          body: 'hello',
          senderId: 'u2',
          createdAt: DateTime(2026, 11),
        ),
      );
    await pumpContact(
      tester,
      contactTestApp(
        chat,
        const ConversationScreen(conversationId: 'c1'),
        pushed: [],
        extra: [messageStoreProvider.overrideWithValue(null)],
      ),
    );
    await tester.pump(const Duration(seconds: 1));
    expect(chat.reads, ['m1'], reason: 'the first open reads');

    // «Отметить как непрочитанное» from the list while this chat's thread
    // is still alive (the same session), then the chat shows again.
    chat.conv = chat.conv.withActivity(markedUnread: true);
    final container = ProviderScope.containerOf(
      tester.element(find.byType(ConversationScreen)),
    );
    final thread = container.read(chatThreadProvider('c1').notifier);
    await thread.refreshConversation();
    final done = thread.markRead();
    await tester.pump(const Duration(seconds: 1));
    await done;
    expect(chat.reads, ['m1', 'm1'], reason: 'the mark is taken off again');

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 6));
  });
}
