import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:material_ui/material_ui.dart';

import '../../helpers/ux_harness.dart';
import '../groups/fake_group_repository.dart';

Conversation _conv(
  String id, {
  required String lastFrom,
  String body = 'Hello',
}) =>
    Conversation(
      id: id,
      caseId: 'case-$id',
      caseTitle: 'Custody',
      status: ConversationStatus.active,
      contactsUnlocked: true,
      counterpart: Counterpart(
        isAttorney: false,
        verified: false,
        id: 'u-$id',
        displayName: 'Person $id',
      ),
      unreadCount: 0,
      updatedAt: DateTime(2026),
      lastMessageAt: DateTime.now().subtract(const Duration(hours: 2)),
      lastMessage: ChatMessage(
        id: 'm-$id',
        conversationId: id,
        kind: MessageKind.text,
        body: body,
        createdAt: DateTime(2026),
        senderId: lastFrom,
      ),
    );

class _Chats implements ChatRepository {
  final folders = <ChatListFolder>[];

  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) async {
    folders.add(folder);
    return CursorPage(
      items: [
        _conv('a', lastFrom: 'u-a'),
        _conv('b', lastFrom: 'me'),
        _conv('c', lastFrom: 'u-c', body: 'Thank you!'),
      ],
    );
  }

  @override
  Future<({int waiting, int requests, int cases, int archived})>
      folderCounts() async => (waiting: 0, requests: 0, cases: 1, archived: 0);

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

/// Owner 2026-10-21: the case chats, «Awaiting reply». Owner 2026-11-18:
/// they are the «Кейсы» top tab now — the list the tab shows, no chip.
void main() {
  setUpAll(initializeDateFormatting);

  testWidgets('Cases list: no Cases chip; waiting chats are marked',
      (tester) async {
    final repo = _Chats();
    tester.view
      ..physicalSize = const Size(360, 800)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    var folder = ChatListFolder.all;
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) => ConversationsView(
              folder: folder,
              onFolder: (f) => setState(() => folder = f),
            ),
          ),
        ),
        size: const Size(360, 800),
        theme: AppTheme.light(),
        disableAnimations: true,
        textScale: 1.1,
        overrides: uxOverrides(
          extra: [
            chatRepositoryProvider.overrideWithValue(repo),
            groupRepositoryProvider.overrideWithValue(FakeGroupRepository()),
            currentUserIdProvider.overrideWithValue('me'),
            realtimeClientProvider.overrideWithValue(null),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();
    // Owner 2026-11-18: no «Кейсы» and no «Непрочитанные» chip any more.
    // Owner 2026-11-25: no «Ожидают ответа» either.
    expect(find.byKey(const ValueKey('chat-folder-all')), findsOneWidget);
    expect(find.byKey(const ValueKey('chat-folder-waiting')), findsNothing);
    expect(find.byKey(const ValueKey('chat-folder-cases')), findsNothing);
    expect(find.byKey(const ValueKey('chat-folder-unread')), findsNothing);
    // Owner 2026-11-25: «Все» shows no case chat — they are in «Кейсы».
    expect(find.text('Person a'), findsNothing);
    expect(find.text('Person b'), findsNothing);

    // What the «Кейсы» tab shows.
    await tester.pumpWidget(
      uxApp(
        const Scaffold(
          body: ConversationsView(
            folder: ChatListFolder.cases,
            showFolders: false,
          ),
        ),
        size: const Size(360, 800),
        theme: AppTheme.light(),
        disableAnimations: true,
        textScale: 1.1,
        overrides: uxOverrides(
          extra: [
            chatRepositoryProvider.overrideWithValue(repo),
            groupRepositoryProvider.overrideWithValue(FakeGroupRepository()),
            currentUserIdProvider.overrideWithValue('me'),
            realtimeClientProvider.overrideWithValue(null),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(repo.folders, contains(ChatListFolder.cases));
    expect(find.byKey(const ValueKey('chat-awaiting-a')), findsOneWidget);
    expect(find.byKey(const ValueKey('chat-awaiting-b')), findsNothing);
    // N-03: a closing «Thank you!» does not wait for an answer.
    expect(find.byKey(const ValueKey('chat-awaiting-c')), findsNothing);
    // N-03: long-press → «No reply needed» clears the label of that chat.
    await tester.longPress(find.byKey(const ValueKey('chat-organize-a')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('organize-no-reply')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('chat-awaiting-a')), findsNothing);
    // No label, no such menu row (and none on a chat that is not waiting).
    await tester.longPress(find.byKey(const ValueKey('chat-organize-a')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('organize-no-reply')), findsNothing);
    expect(find.byKey(const ValueKey('organize-pin')), findsOneWidget);
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 5));
  });
}
