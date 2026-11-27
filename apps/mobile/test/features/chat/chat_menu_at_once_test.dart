import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:material_ui/material_ui.dart';

import '../../helpers/ux_harness.dart';
import '../groups/fake_group_repository.dart';

/// Owner 26.11 (Telegram, WhatsApp): the chat's long-press menu closes at
/// once and the list has already changed; a multi-chat action changes every
/// row at once and puts back only the chats the server refused.
Conversation _conv(String id, {int hoursAgo = 2}) => Conversation(
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
      lastMessageAt: DateTime.now().subtract(Duration(hours: hoursAgo)),
      lastMessage: ChatMessage(
        id: 'm-$id',
        conversationId: id,
        senderId: 'u-$id',
        kind: MessageKind.text,
        body: 'Hello $id',
        createdAt: DateTime(2026),
      ),
    );

const _refused = ApiException(code: ApiErrorCodes.internalError, message: 'x');

class _Chats implements ChatRepository {
  _Chats(this.rows, {this.refuse = const {}});

  final List<Conversation> rows;

  /// Chats whose write the server refuses.
  final Set<String> refuse;
  final gate = Completer<void>();
  final gone = <String>{};
  final writes = <String>[];

  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) async =>
      CursorPage(
        items: updatedSince != null
            ? const []
            : [
                for (final c in rows)
                  if (!gone.contains(c.id)) c,
              ],
      );

  @override
  Future<({int waiting, int requests, int cases, int archived})>
      folderCounts() async => (waiting: 0, requests: 0, cases: 0, archived: 0);

  @override
  Future<Conversation> organize(
    String id, {
    ChatFolder? folder,
    bool resetFolder = false,
    bool? waiting,
    String? note,
    bool? pinned,
    bool? hidden,
    bool? archived,
    bool? unread,
  }) async {
    writes.add(id);
    await gate.future;
    if (refuse.contains(id)) throw _refused;
    if ((hidden ?? false) || (archived ?? false)) gone.add(id);
    return rows.firstWhere((c) => c.id == id);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

/// A group write the server refuses.
class _RefusingGroups extends FakeGroupRepository {
  _RefusingGroups(super.items);

  @override
  Future<api.GroupDto> updateMine(String id, api.UpdateGroupMeDto body) async {
    updates.add('refused $id');
    throw _refused;
  }
}

void main() {
  setUpAll(initializeDateFormatting);

  Future<void> pumpInbox(WidgetTester tester, _Chats repo) async {
    tester.view
      ..physicalSize = const Size(1000, 2000)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      uxApp(
        const InboxScreen(),
        size: const Size(1000, 2000),
        theme: AppTheme.light(),
        disableAnimations: true,
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
  }

  Future<void> done(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 5));
  }

  Future<void> openMenu(WidgetTester tester, String id) async {
    await tester.longPress(find.byKey(ValueKey('chat-organize-$id')));
    await tester.pumpAndSettle();
  }

  testWidgets('the menu closes at once on archive; the row is gone',
      (tester) async {
    final repo = _Chats([_conv('a')]);
    await pumpInbox(tester, repo);
    await openMenu(tester, 'a');
    await tester.tap(find.byKey(const ValueKey('organize-archive')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byKey(const ValueKey('organize-archive')), findsNothing);
    expect(find.text('Person a'), findsNothing);
    expect(repo.writes, ['a'], reason: 'the request is on its way');
    repo.gate.complete();
    await tester.pumpAndSettle();
    expect(find.text('Person a'), findsNothing);
    await done(tester);
  });

  testWidgets('a refused archive brings the row back with the error',
      (tester) async {
    final repo = _Chats([_conv('a')], refuse: {'a'});
    await pumpInbox(tester, repo);
    await openMenu(tester, 'a');
    await tester.tap(find.byKey(const ValueKey('organize-archive')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byKey(const ValueKey('organize-archive')), findsNothing);
    expect(find.text('Person a'), findsNothing);
    repo.gate.complete();
    await tester.pumpAndSettle();
    expect(find.text('Person a'), findsOneWidget);
    expect(find.byType(SnackBar), findsOneWidget);
    await done(tester);
  });

  testWidgets('the menu closes at once on pin', (tester) async {
    final repo = _Chats([_conv('a', hoursAgo: 1), _conv('b', hoursAgo: 5)]);
    await pumpInbox(tester, repo);
    await openMenu(tester, 'b');
    await tester.tap(find.byKey(const ValueKey('organize-pin')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byKey(const ValueKey('organize-pin')), findsNothing);
    final a = tester.getTopLeft(find.text('Person a')).dy;
    final b = tester.getTopLeft(find.text('Person b')).dy;
    expect(b, lessThan(a), reason: 'the pinned chat leads at once');
    repo.gate.complete();
    await tester.pumpAndSettle();
    await done(tester);
  });

  testWidgets('select → delete: all rows go at once, only refused come back',
      (tester) async {
    final repo = _Chats(
      [_conv('a', hoursAgo: 1), _conv('b', hoursAgo: 3), _conv('c')],
      refuse: {'b'},
    );
    await pumpInbox(tester, repo);
    await tester.tap(find.byKey(const ValueKey('chats-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('chats-menu-select')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('select-all')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('select-delete')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete').last);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    for (final id in ['a', 'b', 'c']) {
      expect(find.text('Person $id'), findsNothing, reason: '$id at once');
    }
    expect(repo.writes.toSet(), {'a', 'b', 'c'}, reason: 'sent together');
    repo.gate.complete();
    await tester.pumpAndSettle();
    expect(find.text('Person b'), findsOneWidget);
    expect(find.text('Person a'), findsNothing);
    expect(find.text('Person c'), findsNothing);
    expect(find.textContaining('Not done for 1 of 3'), findsOneWidget);
    await done(tester);
  });

  // Owner 26.11: these messages went to the messenger's own context (no
  // messenger above it) and were never seen.
  testWidgets('the full menu «Save» shows «Saved»', (tester) async {
    final repo = _Chats([_conv('a')]);
    repo.gate.complete();
    await pumpInbox(tester, repo);
    await openMenu(tester, 'a');
    await tester.tap(find.byKey(const ValueKey('organize-more')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('organize-save')));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Saved'), findsOneWidget);
    await done(tester);
  });

  testWidgets('a refused group archive shows the error', (tester) async {
    tester.view
      ..physicalSize = const Size(390, 800)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final groups = _RefusingGroups([listGroup('g1')]);
    await tester.pumpWidget(
      uxApp(
        const Scaffold(body: GroupTilesList()),
        size: const Size(390, 800),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [
            chatRepositoryProvider.overrideWithValue(_Chats(const [])),
            groupRepositoryProvider.overrideWithValue(groups),
            groupsEnabledProvider.overrideWithValue(true),
            currentUserIdProvider.overrideWithValue('me'),
            realtimeClientProvider.overrideWithValue(null),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.longPress(find.byKey(const ValueKey('group-tile-g1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('group-menu-archive')));
    await tester.pumpAndSettle();
    expect(groups.updates, contains('refused g1'));
    expect(tester.takeException(), isNull);
    expect(find.byType(SnackBar), findsOneWidget);
    expect(find.byKey(const ValueKey('group-tile-g1')), findsOneWidget);
    await done(tester);
  });
}
