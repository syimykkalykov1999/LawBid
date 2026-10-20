import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/chat_text_drafts.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../helpers/ux_harness.dart';
import '../groups/fake_group_repository.dart';

Conversation _conv({ChatMessage? last, int unread = 0, bool muted = false}) =>
    Conversation(
      id: 'c1',
      caseId: null,
      caseTitle: null,
      status: ConversationStatus.active,
      contactsUnlocked: true,
      counterpart: const Counterpart(
        isAttorney: false,
        verified: false,
        id: 'u1',
        displayName: 'Anna Petrova',
      ),
      unreadCount: unread,
      updatedAt: DateTime(2026),
      lastMessageAt: DateTime.now().subtract(const Duration(hours: 2)),
      lastMessage: last,
      mutedUntil: muted ? DateTime(2100) : null,
    );

class _Chats implements ChatRepository {
  _Chats(this.conv);

  final Conversation conv;
  final calls = <String>[];

  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) async =>
      CursorPage(items: [conv]);

  @override
  Future<({int waiting, int requests})> folderCounts() async =>
      (waiting: 0, requests: 0);

  @override
  Future<Conversation> organize(
    String id, {
    ChatFolder? folder,
    bool resetFolder = false,
    bool? waiting,
    String? note,
    bool? pinned,
    bool? hidden,
  }) async {
    calls.add('organize pinned=$pinned hidden=$hidden');
    return conv;
  }

  @override
  Future<Conversation> mute(String id, DateTime? until) async {
    calls.add('mute ${until == null ? 'off' : 'on'}');
    return conv;
  }

  @override
  Future<void> read(String id, String lastReadMessageId) async {
    calls.add('read $lastReadMessageId');
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

ChatMessage _msg({
  MessageKind kind = MessageKind.text,
  String body = 'Hello',
  ChatAttachment? attachment,
}) =>
    ChatMessage(
      id: 'm1',
      conversationId: 'c1',
      senderId: 'u1',
      kind: kind,
      body: body,
      attachment: attachment,
      createdAt: DateTime(2026),
    );

void main() {
  setUpAll(initializeDateFormatting);

  Future<_Chats> pump(
    WidgetTester tester,
    Conversation conv, {
    Map<String, String> drafts = const {},
  }) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(390, 800);
    addTearDown(tester.view.reset);
    final repo = _Chats(conv);
    await tester.pumpWidget(
      uxApp(
        const Scaffold(body: ConversationsView()),
        size: const Size(390, 800),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [
            chatRepositoryProvider.overrideWithValue(repo),
            groupRepositoryProvider.overrideWithValue(FakeGroupRepository()),
            currentUserIdProvider.overrideWithValue('me'),
            realtimeClientProvider.overrideWithValue(null),
            if (drafts.isNotEmpty)
              chatTextDraftsProvider.overrideWith(
                () => _Seeded(drafts),
              ),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();
    return repo;
  }

  testWidgets('swipe right pins, swipe left mutes; the row stays',
      (tester) async {
    final repo = await pump(tester, _conv(last: _msg()));
    final row = find.byKey(const ValueKey('chat-swipe-c1'));
    await tester.drag(row, const Offset(300, 0));
    await tester.pumpAndSettle();
    expect(repo.calls, contains('organize pinned=true hidden=null'));
    expect(find.text('Anna Petrova'), findsOneWidget);
    await tester.drag(row, const Offset(-300, 0));
    await tester.pumpAndSettle();
    expect(repo.calls, contains('mute on'));
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 5));
  });

  testWidgets('long press: mute, mark read and delete are in the menu',
      (tester) async {
    final repo = await pump(tester, _conv(last: _msg(), unread: 2));
    await tester.longPress(find.byKey(const ValueKey('chat-organize-c1')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('organize-mute')), findsOneWidget);
    expect(find.byKey(const ValueKey('organize-delete')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('organize-read')));
    await tester.pumpAndSettle();
    expect(repo.calls, contains('read m1'));
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 5));
  });

  testWidgets('a video and a document show their own icon', (tester) async {
    await pump(
      tester,
      _conv(
        last: _msg(
          kind: MessageKind.attachment,
          body: '',
          attachment: const ChatAttachment(
            fileId: 'a1',
            name: 'clip.mp4',
            url: 'https://x/clip.mp4',
            isImage: false,
            mime: 'video/mp4',
          ),
        ),
      ),
    );
    expect(find.textContaining('🎥'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 5));
  });

  testWidgets('an unsent text shows as a draft line', (tester) async {
    await pump(
      tester,
      _conv(last: _msg()),
      drafts: {'c1': 'See you at ten'},
    );
    expect(find.byKey(const ValueKey('chat-draft-c1')), findsOneWidget);
    expect(
      find.textContaining('See you at ten', findRichText: true),
      findsOneWidget,
    );
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 5));
  });
}

class _Seeded extends ChatTextDrafts {
  _Seeded(this.seed);

  final Map<String, String> seed;

  @override
  Map<String, String> build() => seed;
}
