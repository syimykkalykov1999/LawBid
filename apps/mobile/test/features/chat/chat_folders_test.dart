import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/perf/build_counter.dart';
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

Conversation _conv(
  String id, {
  String? caseTitle,
  String? note,
  DateTime? waitingSince,
  ChatFolder folder = ChatFolder.general,
  bool mineLast = false,
  bool read = false,
}) =>
    Conversation(
      lastMessage: mineLast
          ? ChatMessage(
              id: 'm-$id',
              conversationId: id,
              kind: MessageKind.text,
              body: 'See you at 10',
              createdAt: DateTime(2026),
              senderId: 'me',
            )
          : null,
      counterpartLastReadId: read ? 'm-$id' : null,
      id: id,
      caseId: caseTitle == null ? null : 'case-$id',
      caseTitle: caseTitle,
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
      lastMessageAt: DateTime.now().subtract(const Duration(hours: 10)),
      folder: folder,
      note: note,
      waitingSince: waitingSince,
    );

class _Chats implements ChatRepository {
  final organized = <String>[];
  final hiddenIds = <String>[];
  final folders = <ChatListFolder>[];
  final queries = <String?>[];

  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) async {
    folders.add(requests ? ChatListFolder.requests : folder);
    queries.add(q);
    return CursorPage(
      items: switch (folder) {
        ChatListFolder.waiting => [
            _conv(
              'w',
              note: 'Send him the retainer documents',
              waitingSince: DateTime.now().subtract(const Duration(hours: 3)),
            ),
          ],
        ChatListFolder.primary => [
            _conv('p', caseTitle: 'Custody', folder: ChatFolder.primary),
          ],
        _ => [
            _conv(
              'p',
              caseTitle: 'Custody',
              folder: ChatFolder.primary,
              mineLast: true,
              read: true,
            ),
            _conv('w', note: 'Send him the retainer documents', mineLast: true),
          ],
      },
    );
  }

  @override
  Future<({int waiting, int requests, int cases, int archived})>
      folderCounts() async => (waiting: 1, requests: 2, cases: 0, archived: 0);

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
  }) async {
    if (hidden ?? false) hiddenIds.add(id);
    organized.add('$id:${folder?.name}:$waiting:$note:$pinned');
    return _conv(id);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

/// Owner 2026-10-01: folders inside Chats, the chat menu, notes.
void main() {
  setUpAll(initializeDateFormatting);

  testWidgets('folders, the note in the list, waiting + note from ⋯',
      (tester) async {
    final repo = _Chats();
    tester.view.physicalSize = const Size(1000, 2000);
    tester.view.devicePixelRatio = 1;
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
    // All · Primary · General · Waiting (1) · Requests (2).
    expect(find.text('All'), findsOneWidget);
    expect(find.text('Waiting'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
    // The note is visible without opening the chat; time bottom-right.
    expect(find.text('Send him the retainer documents'), findsOneWidget);
    expect(find.text('10h'), findsNWidgets(2));
    // Owner 2026-10-20: the time is top right on the title's line in every
    // row, whatever the number of preview lines under it.
    final times = tester.widgetList(find.text('10h')).length;
    expect(times, 2);
    for (final id in ['p', 'w']) {
      final title = tester.getCenter(find.text('Person $id'));
      final row = find.ancestor(
        of: find.text('Person $id'),
        matching: find.byKey(ValueKey('chat-organize-$id')),
      );
      final time = tester.getCenter(
        find.descendant(of: row, matching: find.text('10h')),
      );
      expect((time.dy - title.dy).abs(), lessThan(6));
    }
    // Owner 2026-10-01: gold ✓✓ = read, ✓ = sent.
    expect(find.byKey(const ValueKey('chat-read-p')), findsOneWidget);
    expect(find.byKey(const ValueKey('chat-sent-w')), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('chat-folder-waiting')));
    await tester.pumpAndSettle();
    expect(repo.folders, contains(ChatListFolder.waiting));
    expect(find.byKey(const ValueKey('chat-waiting-w')), findsOneWidget);

    // ⋯ → waiting on + a note → saved.
    await tester.longPress(find.byKey(const ValueKey('chat-organize-w')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('organize-note')),
      'Call back at 5',
    );
    await tester.tap(find.byKey(const ValueKey('organize-save')));
    await tester.pumpAndSettle();
    expect(repo.organized.last, 'w:null:true:Call back at 5:null');

    // ⋯: no «Primary» any more; a chat already waiting is not offered
    // «Waiting» again, and there is no «back to automatic».
    await tester.longPress(find.byKey(const ValueKey('chat-organize-w')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('organize-move')), findsNothing);
    expect(find.byKey(const ValueKey('organize-auto')), findsNothing);
  });

  testWidgets('⋮ → Select chats → pick all → delete hides them',
      (tester) async {
    final repo = _Chats();
    tester.view.physicalSize = const Size(1000, 2000);
    tester.view.devicePixelRatio = 1;
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
    await tester.tap(find.byKey(const ValueKey('chats-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('chats-menu-select')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('select-all')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('select-delete')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete').last);
    await tester.pumpAndSettle();
    expect(repo.hiddenIds, isNotEmpty);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 5));
  });

  testWidgets(
      'Chats: one ⋮ menu with select (no new / find groups), one search '
      'magnifier, no second groups button', (tester) async {
    final repo = _Chats();
    tester.view.physicalSize = const Size(1000, 2000);
    tester.view.devicePixelRatio = 1;
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
    // The groups button next to the search box is gone.
    expect(find.byKey(const ValueKey('chats-compose')), findsNothing);
    // Owner 2026-10-22: ONE magnifier, in the top bar; the «+» is a
    // floating button at the bottom right (not in the folder row).
    expect(find.byIcon(AppIcons.searchRounded), findsOneWidget);
    expect(find.byKey(const ValueKey('chat-search-open')), findsNothing);
    final chip =
        tester.getCenter(find.byKey(const ValueKey('chat-folder-all')));
    final plus = tester.getCenter(find.byKey(const ValueKey('chats-new-chat')));
    final lupa =
        tester.getCenter(find.byKey(const ValueKey('chat-search-top')));
    expect(plus.dy, greaterThan(chip.dy + 200));
    expect(plus.dx, greaterThan(500));
    expect(lupa.dy, lessThan(chip.dy - 20));
    // The top magnifier opens the search in the row.
    await tester.tap(find.byKey(const ValueKey('chat-search-top')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('chat-search')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('chat-search-close')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('chats-new-chat')), findsOneWidget);
    // Owner 2026-10-21 (п.22b): ⋮ keeps «Select chats»; «New group» and
    // «Find groups» live on the Channels screen («+» and the magnifier).
    await tester.tap(find.byKey(const ValueKey('chats-menu')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('chats-menu-select')), findsOneWidget);
    expect(find.byKey(const ValueKey('menu-new-group')), findsNothing);
    expect(find.byKey(const ValueKey('menu-find-groups')), findsNothing);
    expect(find.text('New group'), findsNothing);
    expect(find.text('Find groups'), findsNothing);
    expect(
      find.descendant(
        of: find.byType(BottomSheet),
        matching: find.byKey(const ValueKey('chats-new-chat')),
      ),
      findsNothing,
    );
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 5));
  });

  testWidgets('Chats: the + button opens Contacts', (tester) async {
    tester.view.physicalSize = const Size(1000, 2000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final router = GoRouter(
      routes: [
        GoRoute(path: '/', builder: (_, __) => const InboxScreen()),
        GoRoute(
          path: AppRoutes.contacts,
          builder: (_, __) => const Scaffold(body: Text('contacts-page')),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: uxOverrides(
          extra: [
            chatRepositoryProvider.overrideWithValue(_Chats()),
            groupRepositoryProvider.overrideWithValue(FakeGroupRepository()),
            currentUserIdProvider.overrideWithValue('me'),
            realtimeClientProvider.overrideWithValue(null),
          ],
        ),
        child: MaterialApp.router(
          theme: AppTheme.light(),
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('chats-new-chat')));
    await tester.pumpAndSettle();
    expect(find.text('contacts-page'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 5));
  });

  testWidgets(
      'owner 2026-10-26 (smoothness): a search query rebuilds the chats page, '
      'not the whole Inbox', (tester) async {
    final repo = _Chats();
    tester.view.physicalSize = const Size(1000, 2000);
    tester.view.devicePixelRatio = 1;
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
    await tester.tap(find.byKey(const ValueKey('chat-search-top')));
    await tester.pumpAndSettle();
    BuildCounter.reset();
    await tester.enterText(find.byKey(const ValueKey('chat-search')), 'anna');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('chat-search')), '');
    await tester.pumpAndSettle();
    final builds = BuildCounter.of('inbox.screen');
    // ignore: avoid_print
    print('inbox: two queries -> inbox screen builds=$builds');
    expect(builds, 0);
    // The query still reached the list.
    expect(repo.queries, contains('anna'));
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 5));
  });
}
