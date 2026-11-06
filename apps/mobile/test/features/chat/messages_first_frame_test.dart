import 'dart:async';

import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/chat_thread_memory.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/message_store.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/conversation_screen.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../groups/fake_group_repository.dart';
import 'contact_info_test.dart';

/// R-404 (c) (owner 2026-11-04, iPhone recording): the message list came a
/// few frames after the chat screen. A chat whose page is in memory (it was
/// open before, or the Chats tab pre-warmed it from the phone) now draws
/// its bubbles in the SAME first frame as the header and the composer.
class _SlowServerChat extends FakeContactChat {
  _SlowServerChat(super.conv);

  final _neverConv = Completer<Conversation>();
  final _neverPage = Completer<CursorPage<ChatMessage>>();
  int pages = 0;

  @override
  Future<Conversation> conversation(String id) => _neverConv.future;

  @override
  Future<CursorPage<ChatMessage>> messages(String id, {String? cursor}) {
    pages++;
    return _neverPage.future;
  }

  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) async =>
      CursorPage(items: [conv]);
}

class _Inbox extends ConsumerWidget {
  const _Inbox();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(conversationsProvider);
    return Scaffold(body: Text(list.hasValue ? 'inbox ready' : 'inbox'));
  }
}

ChatMessage _msg(String id, String from, {int minute = 0}) => ChatMessage(
      id: id,
      conversationId: 'c1',
      senderId: from,
      kind: MessageKind.text,
      body: 'cached $id',
      createdAt: DateTime(2026, 1, 1, 12, minute),
    );

api.MessageDto _dto(String id, {int minute = 0}) => api.MessageDto(
      id: id,
      conversationId: 'c1',
      senderId: 'u2',
      type: api.MessageDtoType.text,
      body: 'stored $id',
      contactMasked: false,
      createdAt: DateTime(2026, 1, 1, 12, minute),
      revoked: false,
      forwarded: false,
      reactions: const [],
      pinned: false,
    );

void main() {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
  setUpAll(initializeDateFormatting);
  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel('com.llfbandit.record/messages'),
      (_) async => null,
    );
  });

  testWidgets(
      'a chat whose page is in memory draws its bubbles in the very first '
      'frame, with the header and the composer', (tester) async {
    final chat = _SlowServerChat(makeConv());
    final memory = ChatThreadMemory()
      ..put('c1', [_msg('m2', 'me', minute: 2), _msg('m1', 'u2', minute: 1)]);
    await pumpContact(
      tester,
      contactTestApp(
        chat,
        const _Inbox(),
        pushed: [],
        extra: [
          chatThreadMemoryProvider.overrideWithValue(memory),
          // No phone copy in this test: only the memory counts.
          messageStoreProvider.overrideWithValue(null),
        ],
      ),
    );
    expect(find.text('inbox ready'), findsOneWidget);

    unawaited(
      Navigator.of(tester.element(find.text('inbox ready'))).push(
        MaterialPageRoute<void>(
          builder: (_) => const ConversationScreen(conversationId: 'c1'),
        ),
      ),
    );
    // ONE frame — the server never answers during the test.
    await tester.pump();
    final screen = find.byType(ConversationScreen, skipOffstage: false);
    expect(screen, findsOneWidget);
    expect(find.text('cached m1', skipOffstage: false), findsOneWidget);
    expect(find.text('cached m2', skipOffstage: false), findsOneWidget);
    expect(find.text('Anna Kowalski', skipOffstage: false), findsOneWidget);
    expect(
      find.descendant(
        of: screen,
        matching: find.byType(TextField, skipOffstage: false),
        skipOffstage: false,
      ),
      findsOneWidget,
    );
    // The following frames keep the same bubbles: nothing goes blank.
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 16));
      expect(find.text('cached m1'), findsOneWidget);
    }
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });

  test('ChatThreadMemory keeps the newest page per chat, least used out', () {
    final memory = ChatThreadMemory(capacity: 2, pageSize: 2)
      ..put('a', [
        _msg('a3', 'me', minute: 3),
        _msg('a2', 'me'),
        _msg('a1', 'me'),
      ])
      ..put('b', [_msg('b1', 'me')]);
    expect(memory.take('a')!.map((m) => m.id), ['a3', 'a2']);
    // «a» was just used: «b» is the one dropped when «c» comes.
    memory.put('c', [_msg('c1', 'me')]);
    expect(memory.contains('b'), isFalse);
    expect(memory.contains('a'), isTrue);
    expect(memory.contains('c'), isTrue);
  });

  test(
      "pre-warm: while the Chats list is on screen the newest chats' first "
      'page is read from the phone into memory (no request)', () async {
    final cache = CacheDatabase(NativeDatabase.memory());
    final store = MessageStore(cache, 'me', limitBytes: () => 1 << 20);
    await store.put('c1', [_dto('s2', minute: 2), _dto('s1', minute: 1)]);
    final chat = _SlowServerChat(makeConv());
    final memory = ChatThreadMemory();
    final c = ProviderContainer(
      overrides: [
        chatRepositoryProvider.overrideWithValue(chat),
        groupRepositoryProvider.overrideWithValue(FakeGroupRepository()),
        currentUserIdProvider.overrideWithValue('me'),
        realtimeClientProvider.overrideWithValue(null),
        cacheDatabaseProvider.overrideWithValue(cache),
        messageStoreProvider.overrideWithValue(store),
        chatThreadMemoryProvider.overrideWithValue(memory),
      ],
    );
    addTearDown(() async {
      c.dispose();
      await cache.close();
    });
    final sub = c.listen(chatPrewarmProvider, (_, __) {});
    addTearDown(sub.close);
    // The list arrives, then the pre-warm reads the phone.
    await Future<void>.delayed(const Duration(milliseconds: 200));
    expect(memory.contains('c1'), isTrue);
    expect(memory.take('c1')!.map((m) => m.body), ['stored s2', 'stored s1']);
    expect(chat.pages, 0, reason: 'the pre-warm never asks the server');
  });
}
