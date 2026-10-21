import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/chat_text_drafts.dart';
import 'package:lawbid/features/chat/application/presence_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

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
  _Chats(this.conv, {this.archivedCount = 0});

  final Conversation conv;
  final int archivedCount;
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
  Future<({int waiting, int requests, int cases, int archived})>
      folderCounts() async =>
          (waiting: 0, requests: 0, cases: 0, archived: archivedCount);

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
    calls.add('organize pinned=$pinned hidden=$hidden');
    if (archived != null) calls.add('archive $archived');
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
  late FakeGroupRepository lastGroups;

  Future<_Chats> pump(
    WidgetTester tester,
    Conversation conv, {
    Map<String, String> drafts = const {},
    int archivedCount = 0,
    List<api.GroupDto> groups = const [],
    Map<String, bool> typing = const {},
  }) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(390, 800);
    addTearDown(tester.view.reset);
    final repo = _Chats(conv, archivedCount: archivedCount);
    final groupRepo = FakeGroupRepository(groups);
    lastGroups = groupRepo;
    await tester.pumpWidget(
      uxApp(
        const Scaffold(body: ConversationsView()),
        size: const Size(390, 800),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [
            chatRepositoryProvider.overrideWithValue(repo),
            groupRepositoryProvider.overrideWithValue(groupRepo),
            currentUserIdProvider.overrideWithValue('me'),
            realtimeClientProvider.overrideWithValue(null),
            if (typing.isNotEmpty)
              listTypingProvider.overrideWith(() => _SeededTyping(typing)),
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
    final rect = tester.getRect(row);
    // From the middle of the row nothing happens: the swipe belongs to the
    // sections.
    await tester.dragFrom(rect.center, const Offset(200, 0));
    await tester.pumpAndSettle();
    expect(repo.calls.where((c) => c.startsWith('organize')), isEmpty);
    // From the leading edge: pin; from the trailing edge: mute.
    await tester.dragFrom(
      Offset(rect.left + 8, rect.center.dy),
      const Offset(200, 0),
    );
    await tester.pumpAndSettle();
    expect(repo.calls, contains('organize pinned=true hidden=null'));
    expect(find.text('Anna Petrova'), findsOneWidget);
    await tester.dragFrom(
      Offset(rect.right - 8, rect.center.dy),
      const Offset(-200, 0),
    );
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

  testWidgets('long press: the menu archives the chat', (tester) async {
    final repo = await pump(tester, _conv(last: _msg()));
    await tester.longPress(find.byKey(const ValueKey('chat-organize-c1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('organize-archive')));
    await tester.pumpAndSettle();
    expect(repo.calls, contains('archive true'));
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 5));
  });

  testWidgets('«Archive (N)» leads the list only when something is archived',
      (tester) async {
    await pump(tester, _conv(last: _msg()), archivedCount: 3);
    expect(find.byKey(const ValueKey('chats-archive-row')), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 5));
    await pump(tester, _conv(last: _msg()));
    expect(find.byKey(const ValueKey('chats-archive-row')), findsNothing);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 5));
  });

  testWidgets('a group row swipes like a chat and archives from its menu',
      (tester) async {
    await pump(
      tester,
      _conv(last: _msg()),
      groups: [listGroup('g1', unread: 2)],
    );
    final row = find.byKey(const ValueKey('chat-swipe-g1'));
    final rect = tester.getRect(row);
    await tester.dragFrom(
      Offset(rect.left + 8, rect.center.dy),
      const Offset(200, 0),
    );
    await tester.pumpAndSettle();
    expect(lastGroups.updates.any((u) => u.contains('pinned=true')), isTrue);
    await tester.dragFrom(
      Offset(rect.right - 8, rect.center.dy),
      const Offset(-200, 0),
    );
    await tester.pumpAndSettle();
    expect(lastGroups.updates.any((u) => u.contains('muted=true')), isTrue);
    await tester.longPress(find.byKey(const ValueKey('group-tile-g1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('group-menu-archive')));
    await tester.pumpAndSettle();
    expect(
      lastGroups.updates.any((u) => u.contains('archived=true')),
      isTrue,
    );
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

  testWidgets('the list says «recording a voice message…» for a voice note',
      (tester) async {
    await pump(tester, _conv(last: _msg()), typing: {'c1': true});
    expect(
      tester.widget<Text>(find.byKey(const ValueKey('chat-typing-c1'))).data,
      'recording a voice message…',
    );
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

class _SeededTyping extends ListTypingNotifier {
  _SeededTyping(this.seed);

  final Map<String, bool> seed;

  @override
  Map<String, bool> build() => seed;
}
