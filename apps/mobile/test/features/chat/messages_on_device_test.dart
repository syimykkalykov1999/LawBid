import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/data/message_store.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-22 (client economy plan, package C, WhatsApp): a chat
/// opens from the phone's copy with no page request; the server is asked
/// only for what came after the newest message; too much missed (409)
/// reloads the page; the store evicts the chat opened longest ago.
api.MessageDto dto(String id, String conv, {int minute = 0, String? body}) =>
    api.MessageDto(
      id: id,
      conversationId: conv,
      senderId: 'other',
      type: api.MessageDtoType.text,
      body: body ?? 'msg $id',
      contactMasked: false,
      createdAt: DateTime.utc(2026, 10, 22, 12, minute),
      revoked: false,
      forwarded: false,
      reactions: const [],
      pinned: false,
    );

class _FakeChat implements ChatRepository {
  int pageCalls = 0;
  int afterCalls = 0;
  bool tooOld = false;
  List<ChatMessage> after = const [];
  List<ChatMessage> page = const [];

  @override
  Future<Conversation> conversation(String id) async => Conversation(
        id: id,
        caseId: 'case-1',
        caseTitle: 'Speeding ticket',
        status: ConversationStatus.preAcceptance,
        contactsUnlocked: false,
        counterpart: const Counterpart(isAttorney: false, verified: false),
        unreadCount: 0,
        updatedAt: DateTime(2026),
      );

  @override
  Future<CursorPage<ChatMessage>> messages(String id, {String? cursor}) async {
    pageCalls++;
    return CursorPage(items: page);
  }

  @override
  Future<List<ChatMessage>> messagesAfter(String id, String afterId) async {
    afterCalls++;
    if (tooOld) {
      throw const ApiException(code: ApiErrorCodes.syncTooOld, message: '');
    }
    return after;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

void main() {
  late CacheDatabase cache;
  late MessageStore store;
  late _FakeChat chat;

  setUp(() {
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
    cache = CacheDatabase(NativeDatabase.memory());
    store = MessageStore(cache, 'me', limitBytes: () => 50 * 1024 * 1024);
    chat = _FakeChat();
  });
  tearDown(() => cache.close());

  ProviderContainer container() {
    final social = SocialLocalDatabase(NativeDatabase.memory());
    final c = ProviderContainer(
      overrides: [
        chatRepositoryProvider.overrideWithValue(chat),
        socialLocalDatabaseProvider.overrideWithValue(social),
        cacheDatabaseProvider.overrideWithValue(cache),
        messageStoreProvider.overrideWithValue(store),
        currentUserIdProvider.overrideWithValue('me'),
        realtimeClientProvider.overrideWithValue(null),
        networkInterfaceMonitorProvider.overrideWithValue(FakeNetworkMonitor()),
        reachabilityProbeProvider.overrideWithValue(FakeProbe().call),
      ],
    );
    addTearDown(() async {
      c.dispose();
      await social.close();
    });
    return c;
  }

  Future<void> settle() =>
      Future<void>.delayed(const Duration(milliseconds: 60));

  test('the store pages newest first and reports the newest id', () async {
    await store
        .put('c1', [dto('a', 'c1', minute: 1), dto('b', 'c1', minute: 3)]);
    await store.put('c1', [dto('c', 'c1', minute: 2)], nextCursor: 'cur');
    final page = await store.page('c1');
    expect(page.map((m) => m.id), ['b', 'c', 'a']);
    final older =
        await store.page('c1', before: DateTime.utc(2026, 10, 22, 12, 2));
    expect(older.map((m) => m.id), ['a']);
    final h = await store.history('c1');
    expect(h?.newestId, 'b');
    expect(h?.nextCursor, 'cur');
    expect(h?.complete, false);
  });

  test('a chat opens from the phone: 0 page requests, 1 afterId', () async {
    await store
        .put('c1', [dto('a', 'c1', minute: 1), dto('b', 'c1', minute: 2)]);
    chat.after = [ChatMappers.message(dto('c', 'c1', minute: 3))];
    final c = container();
    final sub = c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await settle();
    final s = c.read(chatThreadProvider('c1'));
    expect(s.loading, false);
    expect(s.messages.map((m) => m.id), ['c', 'b', 'a']);
    expect(chat.pageCalls, 0);
    expect(chat.afterCalls, 1);
  });

  test('a chat without a copy reads its first page and keeps it', () async {
    chat.page = [ChatMappers.message(dto('x', 'c2'))];
    final c = container();
    final sub = c.listen(chatThreadProvider('c2'), (_, __) {});
    addTearDown(sub.close);
    await settle();
    expect(chat.pageCalls, 1);
    expect(chat.afterCalls, 0);
    expect(c.read(chatThreadProvider('c2')).messages.single.id, 'x');
  });

  test('too much missed (409): the copy goes, the page is read again',
      () async {
    await store.put('c1', [dto('a', 'c1', minute: 1)]);
    chat
      ..tooOld = true
      ..page = [ChatMappers.message(dto('z', 'c1', minute: 9))];
    final c = container();
    final sub = c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await settle();
    expect(chat.afterCalls, 1);
    expect(chat.pageCalls, 1);
    expect(c.read(chatThreadProvider('c1')).messages.map((m) => m.id), ['z']);
  });

  test('LRU by chat: the chat opened longest ago leaves whole', () async {
    final big = 'x' * 2000;
    await store
        .put('old', [dto('o1', 'old', body: big), dto('o2', 'old', body: big)]);
    await Future<void>.delayed(const Duration(milliseconds: 5));
    await store.put('new', [dto('n1', 'new', body: big)]);
    final dropped = await cache.trimMessages(5000, keep: 'new');
    expect(dropped, ['old']);
    expect(await store.page('old'), isEmpty);
    expect((await store.page('new')).length, 1);
  });

  test("another account does not see this one's chats", () async {
    await store.put('c1', [dto('a', 'c1')]);
    final other = MessageStore(cache, 'someone', limitBytes: () => 1 << 20);
    expect(await other.page('c1'), isEmpty);
  });
}
