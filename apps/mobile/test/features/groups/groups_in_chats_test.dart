import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_chat_tile.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:material_ui/material_ui.dart';

import '../../helpers/ux_harness.dart';
import 'fake_group_repository.dart';

Conversation _conv(String id) => Conversation(
      id: id,
      caseId: null,
      caseTitle: null,
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
      lastMessageAt: DateTime.now().subtract(const Duration(hours: 1)),
    );

class _Chats implements ChatRepository {
  final asked = <({ChatListFolder folder, String? q})>[];

  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) async {
    asked.add((folder: folder, q: q));
    return CursorPage(items: [_conv('a'), _conv('b')]);
  }

  @override
  Future<({int waiting, int requests, int cases, int archived})>
      folderCounts() async => (waiting: 0, requests: 0, cases: 0, archived: 0);

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

/// Owner 2026-11-16 (WhatsApp «Группы» filter): while «Группы в чатах» is
/// on, a «Группы» pill shows my groups. Owner 2026-11-26: the groups are
/// ONLY there — «Все» holds the 1:1 chats. Off: no group row, no pill.
void main() {
  setUpAll(initializeDateFormatting);

  Future<_Chats> pump(
    WidgetTester tester, {
    required bool on,
    String query = '',
    ChatListFolder folder = ChatListFolder.all,
  }) async {
    final repo = _Chats();
    tester.view.physicalSize = const Size(1000, 2000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    var shown = folder;
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) => ConversationsView(
              folder: shown,
              onFolder: (f) => setState(() => shown = f),
              query: query,
              onQuery: (_) {},
            ),
          ),
        ),
        size: const Size(1000, 2000),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [
            chatRepositoryProvider.overrideWithValue(repo),
            groupRepositoryProvider.overrideWithValue(
              FakeGroupRepository([
                listGroup('g1', unread: 2),
                listGroup('g2', minutes: 5),
              ]),
            ),
            groupsEnabledProvider.overrideWithValue(on),
            currentUserIdProvider.overrideWithValue('me'),
            realtimeClientProvider.overrideWithValue(null),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();
    return repo;
  }

  testWidgets('on: «Все» has only the 1:1 chats, no group (owner 26.11)',
      (tester) async {
    await pump(tester, on: true);
    expect(find.byType(GroupChatTile), findsNothing);
    expect(find.text('Person a'), findsOneWidget);
    expect(find.text('Person b'), findsOneWidget);
    // The «Группы» pill, with the number of groups that have unread.
    final pill = find.byKey(const ValueKey('chat-folder-groups'));
    expect(pill, findsOneWidget);
    expect(
      find.descendant(of: pill, matching: find.text('Groups')),
      findsOneWidget,
    );
    expect(find.descendant(of: pill, matching: find.text('1')), findsOneWidget);
  });

  testWidgets('on: the «Группы» pill shows only the groups, no chat request',
      (tester) async {
    final repo = await pump(tester, on: true);
    final before = repo.asked.length;
    await tester.tap(find.byKey(const ValueKey('chat-folder-groups')));
    await tester.pumpAndSettle();
    expect(find.byType(GroupChatTile), findsNWidgets(2));
    expect(find.text('Person a'), findsNothing);
    // The groups are on the phone already: no folder of direct chats is
    // asked for (the server has no «groups» folder of 1:1 chats).
    expect(repo.asked.length, before);
    expect(
      repo.asked.where((a) => a.folder == ChatListFolder.groups),
      isEmpty,
    );
  });

  testWidgets('on: the search in «Все» finds no group (owner 26.11)',
      (tester) async {
    await pump(tester, on: true, query: 'montgomery');
    expect(find.byType(GroupChatTile), findsNothing);
  });

  testWidgets('on: the search under «Группы» finds groups by their title',
      (tester) async {
    await pump(
      tester,
      on: true,
      query: 'montgomery',
      folder: ChatListFolder.groups,
    );
    expect(find.byType(GroupChatTile), findsNWidgets(2));
  });

  testWidgets('on: «Группы» → «Все» brings no group back', (tester) async {
    await pump(tester, on: true);
    await tester.tap(find.byKey(const ValueKey('chat-folder-groups')));
    await tester.pumpAndSettle();
    expect(find.byType(GroupChatTile), findsNWidgets(2));
    await tester.tap(find.byKey(const ValueKey('chat-folder-all')));
    await tester.pumpAndSettle();
    expect(find.byType(GroupChatTile), findsNothing);
    expect(find.text('Person a'), findsOneWidget);
  });

  testWidgets('off: no group row and no «Группы» pill', (tester) async {
    await pump(tester, on: false);
    expect(find.byType(GroupChatTile), findsNothing);
    expect(find.byKey(const ValueKey('chat-folder-groups')), findsNothing);
    expect(find.text('Person a'), findsOneWidget);
  });
}
