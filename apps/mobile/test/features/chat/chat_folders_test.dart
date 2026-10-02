import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../helpers/ux_harness.dart';

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
  final folders = <ChatListFolder>[];

  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
  }) async {
    folders.add(requests ? ChatListFolder.requests : folder);
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
  Future<({int waiting, int requests})> folderCounts() async =>
      (waiting: 1, requests: 2);

  @override
  Future<Conversation> organize(
    String id, {
    ChatFolder? folder,
    bool resetFolder = false,
    bool? waiting,
    String? note,
    bool? pinned,
  }) async {
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
    expect(find.text('10 h ago'), findsNWidgets(2));
    // Owner 2026-10-01: gold ✓✓ = read, ✓ = sent.
    expect(find.byKey(const ValueKey('chat-read-p')), findsOneWidget);
    expect(find.byKey(const ValueKey('chat-sent-w')), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('chat-folder-waiting')));
    await tester.pumpAndSettle();
    expect(repo.folders, contains(ChatListFolder.waiting));
    expect(find.byKey(const ValueKey('chat-waiting-w')), findsOneWidget);

    // ⋯ → waiting on + a note → saved.
    await tester.tap(find.byKey(const ValueKey('chat-organize-w')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('organize-note')),
      'Call back at 5',
    );
    await tester.tap(find.byKey(const ValueKey('organize-save')));
    await tester.pumpAndSettle();
    expect(repo.organized.last, 'w:null:true:Call back at 5:null');

    // ⋯ → move to Primary.
    await tester.tap(find.byKey(const ValueKey('chat-organize-w')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('organize-move')));
    await tester.pumpAndSettle();
    expect(repo.organized.last, 'w:primary:null:null:null');
  });
}
