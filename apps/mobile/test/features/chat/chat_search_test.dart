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

Conversation _conv(String id, String name, {String? matched}) => Conversation(
      id: id,
      caseId: null,
      caseTitle: null,
      status: ConversationStatus.active,
      contactsUnlocked: true,
      counterpart: Counterpart(
        isAttorney: false,
        verified: false,
        id: 'u-$id',
        displayName: name,
      ),
      unreadCount: 0,
      updatedAt: DateTime(2026),
      lastMessageAt: DateTime.now().subtract(const Duration(hours: 2)),
      matchedMessage: matched,
    );

class _Chats implements ChatRepository {
  final queries = <String?>[];
  final folders = <ChatListFolder>[];

  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) async {
    queries.add(q);
    folders.add(folder);
    if (q == null) {
      return CursorPage(
        items: [_conv('a', 'Anna Petrova'), _conv('b', 'Boris Ivanov')],
      );
    }
    if (q == 'retainer') {
      return CursorPage(
        items: [
          _conv(
            'b',
            'Boris Ivanov',
            matched: 'Please sign the Retainer agreement today',
          ),
        ],
      );
    }
    return const CursorPage(items: []);
  }

  @override
  Future<({int waiting, int requests})> folderCounts() async =>
      (waiting: 0, requests: 0);

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

void main() {
  setUpAll(initializeDateFormatting);

  testWidgets('typing sends q, shows the matched message, empty state, clear',
      (tester) async {
    final repo = _Chats();
    tester.view.physicalSize = const Size(1000, 2000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    var folder = ChatListFolder.primary;
    var query = '';
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) => ConversationsView(
              folder: folder,
              onFolder: (f) => setState(() => folder = f),
              query: query,
              onQuery: (q) => setState(() => query = q),
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
    expect(find.text('Search chats'), findsOneWidget);
    expect(find.text('Anna Petrova'), findsOneWidget);
    expect(find.text('Boris Ivanov'), findsOneWidget);

    // Typing: the server gets q after the pause, in the same folder.
    await tester.enterText(
      find.byKey(const ValueKey('chat-search')),
      'retainer',
    );
    await tester.pump(const Duration(milliseconds: 100));
    expect(repo.queries.where((q) => q != null), isEmpty);
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(repo.queries.last, 'retainer');
    expect(repo.folders.last, ChatListFolder.primary);
    expect(find.text('Anna Petrova'), findsNothing);
    expect(find.text('Boris Ivanov'), findsOneWidget);
    // The matched message replaces the preview, the typed word in bold.
    final match = tester.widget<Text>(
      find.byKey(const ValueKey('chat-match-b')),
    );
    final spans = (match.textSpan! as TextSpan).children!.cast<TextSpan>();
    expect(
      spans.where((s) => s.style?.fontWeight == FontWeight.w700).single.text,
      'Retainer',
    );

    // Nothing matches: the empty state says what is searched.
    await tester.enterText(find.byKey(const ValueKey('chat-search')), 'zzz');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(find.text('Nothing found'), findsOneWidget);
    expect(find.textContaining('message text'), findsOneWidget);

    // Cleared: the normal list is back.
    await tester.enterText(find.byKey(const ValueKey('chat-search')), '');
    await tester.pumpAndSettle();
    expect(find.text('Nothing found'), findsNothing);
    expect(find.text('Anna Petrova'), findsOneWidget);
    expect(find.text('Boris Ivanov'), findsOneWidget);
  });
}
