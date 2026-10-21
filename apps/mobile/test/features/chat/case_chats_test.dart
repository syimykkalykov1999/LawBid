import 'package:flutter/material.dart';
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

import '../../helpers/ux_harness.dart';
import '../groups/fake_group_repository.dart';

Conversation _conv(String id, {required String lastFrom}) => Conversation(
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
        body: 'Hello',
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
      ],
    );
  }

  @override
  Future<({int waiting, int requests, int cases, int archived})>
      folderCounts() async => (waiting: 0, requests: 0, cases: 1, archived: 0);

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

/// Owner 2026-10-21: the «Cases» chip, only case chats, «Awaiting reply».
void main() {
  setUpAll(initializeDateFormatting);

  testWidgets('Cases chip after All; waiting chats are marked', (tester) async {
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
    final all =
        tester.getTopLeft(find.byKey(const ValueKey('chat-folder-all')));
    final cases =
        tester.getTopLeft(find.byKey(const ValueKey('chat-folder-cases')));
    final waiting =
        tester.getTopLeft(find.byKey(const ValueKey('chat-folder-waiting')));
    expect(cases.dx, greaterThan(all.dx));
    expect(waiting.dx, greaterThan(cases.dx));
    // The count on the chip: one chat waits for an answer.
    expect(find.text('1'), findsWidgets);

    await tester.tap(find.byKey(const ValueKey('chat-folder-cases')));
    await tester.pumpAndSettle();
    expect(repo.folders, contains(ChatListFolder.cases));
    expect(find.byKey(const ValueKey('chat-awaiting-a')), findsOneWidget);
    expect(find.byKey(const ValueKey('chat-awaiting-b')), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 5));
  });
}
