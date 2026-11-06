import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/groups/application/chat_list_merge.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../helpers/ux_harness.dart';
import '../groups/fake_group_repository.dart';

/// R-404 (b) (owner 2026-11-04, Telegram): in «All» one person = one row.
Conversation _conv(
  String id, {
  required String with_,
  required int minute,
  String? caseId,
  int unread = 0,
  bool pinned = false,
}) =>
    Conversation(
      id: id,
      caseId: caseId,
      caseTitle: caseId == null ? null : 'Case $caseId',
      status: ConversationStatus.active,
      contactsUnlocked: true,
      counterpart: Counterpart(
        isAttorney: false,
        verified: false,
        id: with_,
        displayName: 'Person $with_',
      ),
      unreadCount: unread,
      updatedAt: DateTime(2026, 1, 1, 10, minute),
      lastMessageAt: DateTime(2026, 1, 1, 10, minute),
      lastMessage: ChatMessage(
        id: 'm-$id',
        conversationId: id,
        kind: MessageKind.text,
        body: 'from $id',
        createdAt: DateTime(2026, 1, 1, 10, minute),
        senderId: with_,
      ),
      isDirect: caseId == null,
      pinnedAt: pinned ? DateTime(2026) : null,
    );

class _Chats implements ChatRepository {
  _Chats(this.rows);

  final List<Conversation> rows;
  final started = <String>[];

  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) async =>
      CursorPage(items: rows);

  @override
  Future<Conversation> startDirect(String userId) async {
    started.add(userId);
    return _conv('dm-new', with_: userId, minute: 59);
  }

  @override
  Future<({int waiting, int requests, int cases, int archived})>
      folderCounts() async => (waiting: 0, requests: 0, cases: 0, archived: 0);

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

void main() {
  setUpAll(initializeDateFormatting);

  group('groupChatsByPerson', () {
    test('3 case chats + 1 direct chat with one person → ONE row', () {
      final rows = groupChatsByPerson([
        _conv('dm', with_: 'u1', minute: 5, unread: 1),
        _conv('k1', with_: 'u1', caseId: 'A', minute: 20, unread: 2),
        _conv('k2', with_: 'u1', caseId: 'B', minute: 10),
        _conv('k3', with_: 'u1', caseId: 'C', minute: 1, unread: 4),
        _conv('other', with_: 'u9', minute: 15),
      ]);
      expect(rows, hasLength(2));
      final person = rows.whereType<PersonChatEntry>().single;
      // The row is the direct chat …
      expect(person.id, 'dm');
      expect(person.standIn, isFalse);
      expect(person.row.id, 'dm');
      expect(person.row.isDirect, isTrue);
      expect(person.row.caseTitle, isNull);
      // … with the newest message across ALL the chats with that person …
      expect(person.row.lastMessage?.body, 'from k1');
      expect(person.row.lastMessageAt, DateTime(2026, 1, 1, 10, 20));
      // … the unread counts summed …
      expect(person.row.unreadCount, 1 + 2 + 4);
      expect(person.unread, 7);
      // … the case chats newest first, and the newest activity for sorting.
      expect(person.cases.map((c) => c.id), ['k1', 'k2', 'k3']);
      expect(person.activityAt, DateTime(2026, 1, 1, 10, 20));
      final sorted = [...rows]..sort(compareChatEntries);
      expect(sorted.map((e) => e.id), ['dm', 'other']);
    });

    test('only case chats with a person → a stand-in row that starts the DM',
        () {
      final rows = groupChatsByPerson([
        _conv('k1', with_: 'u2', caseId: 'A', minute: 3),
        _conv('k2', with_: 'u2', caseId: 'B', minute: 8, unread: 1),
      ]);
      final person = rows.whereType<PersonChatEntry>().single;
      expect(person.standIn, isTrue);
      expect(person.direct, isNull);
      expect(person.id, PersonChatEntry.standInId('u2'));
      expect(person.row.id, 'person-u2');
      expect(person.row.caseId, isNull);
      expect(person.row.lastMessage?.body, 'from k2');
      expect(person.row.unreadCount, 1);
      expect(person.row.counterpart.id, 'u2');
    });

    test(
        'one conversation with a person stays its own row; hidden clients '
        'and pending requests are never grouped', () {
      final hidden = Conversation(
        id: 'h1',
        caseId: 'Z',
        caseTitle: 'Hidden',
        status: ConversationStatus.preAcceptance,
        contactsUnlocked: false,
        counterpart: const Counterpart(isAttorney: false, verified: false),
        unreadCount: 0,
        updatedAt: DateTime(2026),
      );
      final hidden2 = Conversation(
        id: 'h2',
        caseId: 'Y',
        caseTitle: 'Hidden too',
        status: ConversationStatus.preAcceptance,
        contactsUnlocked: false,
        counterpart: const Counterpart(isAttorney: false, verified: false),
        unreadCount: 0,
        updatedAt: DateTime(2026),
      );
      final rows = groupChatsByPerson([
        _conv('k1', with_: 'u3', caseId: 'A', minute: 3),
        _conv('dm', with_: 'u4', minute: 4),
        hidden,
        hidden2,
      ]);
      expect(rows.whereType<DirectChatEntry>(), hasLength(4));
      expect(rows.whereType<PersonChatEntry>(), isEmpty);
    });

    test('a pinned case chat pins the person row', () {
      final rows = groupChatsByPerson([
        _conv('dm', with_: 'u1', minute: 5),
        _conv('k1', with_: 'u1', caseId: 'A', minute: 2, pinned: true),
        _conv('late', with_: 'u9', minute: 50),
      ])
        ..sort(compareChatEntries);
      expect(rows.first.id, 'dm');
      expect(rows.first.pinned, isTrue);
    });
  });

  testWidgets(
      '«All»: the Chats list shows one row per person; a tap on a person '
      'without a direct chat starts it', (tester) async {
    final repo = _Chats([
      _conv('k1', with_: 'u2', caseId: 'A', minute: 3),
      _conv('k2', with_: 'u2', caseId: 'B', minute: 8),
      _conv('dm', with_: 'u1', minute: 5),
      _conv('k3', with_: 'u1', caseId: 'C', minute: 1),
    ]);
    final router = GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) => const Scaffold(body: ConversationsView()),
        ),
        GoRoute(
          path: '/chat/:id',
          builder: (_, state) =>
              Scaffold(body: Text('chat ${state.pathParameters['id']}')),
        ),
      ],
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: uxOverrides(
          extra: [
            chatRepositoryProvider.overrideWithValue(repo),
            groupRepositoryProvider.overrideWithValue(FakeGroupRepository()),
            currentUserIdProvider.overrideWithValue('me'),
            realtimeClientProvider.overrideWithValue(null),
            messageStoreProvider.overrideWithValue(null),
          ],
        ),
        child: MaterialApp.router(
          theme: AppTheme.light(),
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();
    // Four conversations, two people, two rows.
    expect(find.byType(ConversationRow), findsNWidgets(2));
    expect(find.text('Person u1'), findsOneWidget);
    expect(find.text('Person u2'), findsOneWidget);
    expect(find.byKey(const ValueKey('chat-organize-dm')), findsOneWidget);
    expect(
      find.byKey(const ValueKey('chat-organize-person-u2')),
      findsOneWidget,
    );
    // The person's row previews the newest message of all their chats.
    expect(find.text('from k2'), findsOneWidget);
    expect(find.text('from k3'), findsNothing);

    await tester.tap(find.text('Person u2'));
    await tester.pumpAndSettle();
    expect(repo.started, ['u2']);
    expect(find.text('chat dm-new'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 5));
  });
}
