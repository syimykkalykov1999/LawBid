import 'dart:async';

import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_list_cache.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/data/message_store.dart';
import 'package:lawbid/features/chat/data/realtime_client.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/ux_harness.dart';

/// Owner 2026-11-08 («кэш есть, а не работает»; Telegram / WhatsApp): a
/// chat opened again while the socket stayed up asks the server NOTHING.
/// Before: 3 GETs on every open (conversation, messages after the newest,
/// pinned). After: 0 while the connection that synced it is still up and
/// the chat's events were followed; the old 3 after a reconnect, a drop or
/// an event the copy cannot follow.
api.MessageDto _dto(String id, {int minute = 0, bool pinned = false}) =>
    api.MessageDto(
      id: id,
      conversationId: 'c1',
      senderId: 'other',
      type: api.MessageDtoType.text,
      body: 'msg $id',
      contactMasked: false,
      createdAt: DateTime.utc(2026, 11, 8, 12, minute),
      revoked: false,
      forwarded: false,
      reactions: const [],
      pinned: pinned,
    );

Conversation _row(api.MessageDto last) => Conversation(
      id: 'c1',
      caseId: null,
      caseTitle: null,
      status: ConversationStatus.active,
      contactsUnlocked: true,
      counterpart: const Counterpart(isAttorney: true, verified: true),
      unreadCount: 0,
      updatedAt: last.createdAt,
      lastMessage: ChatMappers.message(last),
      lastMessageAt: last.createdAt,
    );

/// Counts every call that would be a request to the server.
class _Server implements ChatRepository {
  _Server(this.list);

  List<Conversation> list;
  final calls = <String>[];
  List<ChatMessage> after = const [];

  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) async {
    calls.add('GET /conversations');
    return CursorPage(items: list);
  }

  @override
  Future<Conversation> conversation(String id) async {
    calls.add('GET /conversations/$id');
    return list.single;
  }

  @override
  Future<CursorPage<ChatMessage>> messages(String id, {String? cursor}) async {
    calls.add('GET /conversations/$id/messages');
    return const CursorPage(items: []);
  }

  @override
  Future<List<ChatMessage>> messagesAfter(String id, String afterId) async {
    calls.add('GET /conversations/$id/messages?afterId');
    return after;
  }

  @override
  Future<ChatPins> pins(String id) async {
    calls.add('GET /conversations/$id/pins');
    return const ChatPins(
      items: [],
      editWindowMin: 15,
      deleteForAllHours: 48,
      maxPins: 3,
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

class _NoSavedList implements ChatListCache {
  @override
  Future<CursorPage<Conversation>?> read() async => null;

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

/// The socket: up or down, and which connection it is.
class _Socket extends RealtimeClient {
  _Socket()
      : super(
          apiBaseUrl: 'http://localhost',
          token: () async => null,
          refreshToken: () async => null,
        );

  bool up = true;
  int epoch = 1;

  @override
  bool get connected => up;

  @override
  int get connectionEpoch => epoch;

  @override
  void join(String conversationId) {}

  @override
  void leave(String conversationId) {}
}

void main() {
  late CacheDatabase cache;
  late MessageStore store;
  late _Server server;
  late _Socket socket;
  late StreamController<RealtimeEvent> events;
  late ProviderContainer c;
  late ProviderSubscription<Object?> inbox;

  Future<void> settle() =>
      Future<void>.delayed(const Duration(milliseconds: 60));

  setUp(() async {
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
    cache = CacheDatabase(NativeDatabase.memory());
    store = MessageStore(cache, 'me', limitBytes: () => 50 * 1024 * 1024);
    await store.put('c1', [_dto('a', minute: 1), _dto('b', minute: 2)]);
    server = _Server([_row(_dto('b', minute: 2))]);
    socket = _Socket();
    events = StreamController<RealtimeEvent>.broadcast();
    final social = SocialLocalDatabase(NativeDatabase.memory());
    c = ProviderContainer(
      overrides: [
        chatListCacheProvider.overrideWithValue(_NoSavedList()),
        chatRepositoryProvider.overrideWithValue(server),
        socialLocalDatabaseProvider.overrideWithValue(social),
        cacheDatabaseProvider.overrideWithValue(cache),
        messageStoreProvider.overrideWithValue(store),
        currentUserIdProvider.overrideWithValue('me'),
        realtimeClientProvider.overrideWithValue(socket),
        realtimeEventsProvider.overrideWithValue(events.stream),
        networkInterfaceMonitorProvider.overrideWithValue(FakeNetworkMonitor()),
        reachabilityProbeProvider.overrideWithValue(FakeProbe().call),
      ],
    );
    // The chats tab is on screen (the list keeps its rows in step).
    inbox = c.listen(conversationsProvider, (_, __) {});
    await settle();
    server.calls.clear();
    addTearDown(() async {
      inbox.close();
      c.dispose();
      await events.close();
      await social.close();
      await cache.close();
    });
  });

  /// Opens the chat, waits, closes it; the requests it sent.
  Future<List<String>> visit() async {
    final before = server.calls.length;
    final sub = c.listen(chatThreadProvider('c1'), (_, __) {});
    await settle();
    sub.close();
    await settle();
    return server.calls.sublist(before);
  }

  test('first open asks 3 things; every reopen on the same socket asks 0',
      () async {
    expect(await visit(), hasLength(3));
    for (var i = 0; i < 5; i++) {
      expect(await visit(), isEmpty, reason: 'reopen #${i + 1}');
    }
  });

  test(
      'a message that came while the chat was closed is on the phone: '
      'the reopen shows it and asks 0', () async {
    await visit();
    server.calls.clear();
    final m = _dto('c', minute: 3);
    events.add(RealtimeEvent('message:new', {'message': m.toJson()}));
    await settle();
    final sub = c.listen(chatThreadProvider('c1'), (_, __) {});
    await settle();
    expect(
      c.read(chatThreadProvider('c1')).messages.map((x) => x.id),
      ['c', 'b', 'a'],
    );
    sub.close();
    expect(server.calls, isEmpty);
  });

  test('a pin made while the chat was closed shows on the reopen, 0 asked',
      () async {
    await visit();
    server.calls.clear();
    events.add(
      RealtimeEvent('message:updated', {
        'message': _dto('a', minute: 1, pinned: true).toJson(),
      }),
    );
    await settle();
    final sub = c.listen(chatThreadProvider('c1'), (_, __) {});
    await settle();
    expect(c.read(chatThreadProvider('c1')).pins.map((p) => p.id), ['a']);
    expect(c.read(chatThreadProvider('c1')).maxPins, 3);
    sub.close();
    expect(server.calls, isEmpty);
  });

  test('after a reconnect (a new connection) the reopen asks again', () async {
    await visit();
    socket.epoch = 2;
    expect(await visit(), hasLength(3));
    expect(await visit(), isEmpty);
  });

  test('socket down: the reopen asks (it may have missed something)', () async {
    await visit();
    socket.up = false;
    expect(await visit(), hasLength(3));
  });

  test('conversation:update while closed: the reopen asks again', () async {
    await visit();
    events.add(
      const RealtimeEvent('conversation:update', {'conversationId': 'c1'}),
    );
    await settle();
    server.calls.clear();
    final asked = await visit();
    expect(asked, contains('GET /conversations/c1'));
    expect(asked, contains('GET /conversations/c1/pins'));
  });

  test('the chats list shows a newer message than the phone: the reopen asks',
      () async {
    await visit();
    // The list learned of a message the phone never stored (e.g. it was
    // pulled with updatedSince, not seen as an event).
    final m = ChatMappers.message(_dto('z', minute: 9));
    c.read(conversationsProvider.notifier).setItems([
      _row(_dto('b', minute: 2)).withActivity(
        lastMessage: m,
        lastMessageAt: m.createdAt,
      ),
    ]);
    expect(await visit(), contains('GET /conversations/c1/messages?afterId'));
  });
}
