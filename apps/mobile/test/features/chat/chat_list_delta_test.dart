import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/persistence/saved_json.dart';
import 'package:lawbid/features/chat/application/chat_list_delta.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_list_cache.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// Owner 2026-10-22 (load audit finding 2, Telegram updates): the chats
/// list applies socket events to its rows; the server is asked only after a
/// reconnect (`updatedSince`) or for a chat the list does not hold.
Conversation _conv(
  String id, {
  required DateTime at,
  int unread = 0,
  DateTime? pinnedAt,
}) =>
    Conversation(
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
      unreadCount: unread,
      lastMessageAt: at,
      updatedAt: at,
      pinnedAt: pinnedAt,
    );

ChatMessage _msg(String id, String chat, String sender, DateTime at) =>
    ChatMessage(
      id: id,
      conversationId: chat,
      kind: MessageKind.text,
      body: 'hi',
      createdAt: at,
      senderId: sender,
    );

Map<String, Object?> _event(
  String id,
  String chat,
  String sender,
  DateTime at,
) =>
    {
      'message': {
        'id': id,
        'conversationId': chat,
        'senderId': sender,
        'type': 'text',
        'body': 'hi',
        'contactMasked': false,
        'createdAt': at.toUtc().toIso8601String(),
        'revoked': false,
        'forwarded': false,
        'reactions': <Object?>[],
        'pinned': false,
      },
    };

typedef _Call = ({String? cursor, DateTime? updatedSince});

class _Chats implements ChatRepository {
  _Chats(this.first);

  final List<Conversation> first;
  List<Conversation> changed = const [];
  final calls = <_Call>[];

  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) async {
    calls.add((cursor: cursor, updatedSince: updatedSince));
    return CursorPage(items: updatedSince == null ? first : changed);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

class _NoCache extends ChatListCache {
  _NoCache(super.saved);

  @override
  Future<CursorPage<Conversation>?> read() async => null;
}

final t0 = DateTime.utc(2026, 10, 22, 9);

void main() {
  group('pure steps', () {
    final a = _conv('a', at: t0);
    final b = _conv('b', at: t0.add(const Duration(minutes: 1)));
    final p = _conv(
      'p',
      at: t0.subtract(const Duration(days: 1)),
      pinnedAt: t0,
    );

    test('a message from the other side moves the chat up with one unread', () {
      final next = applyNewMessage(
        [p, b, a],
        _msg('m1', 'a', 'them', t0.add(const Duration(minutes: 5))),
        me: 'me',
      )!;
      expect(next.map((c) => c.id), ['p', 'a', 'b']);
      expect(next[1].unreadCount, 1);
      expect(next[1].lastMessage?.id, 'm1');
    });

    test('my own message moves it without an unread; a repeat is ignored', () {
      final m = _msg('m1', 'a', 'me', t0.add(const Duration(minutes: 5)));
      final once = applyNewMessage([b, a], m, me: 'me')!;
      expect(once.first.id, 'a');
      expect(once.first.unreadCount, 0);
      expect(identical(applyNewMessage(once, m, me: 'me'), once), isTrue);
    });

    test('a chat the list does not hold is reported (null)', () {
      expect(
        applyNewMessage([a], _msg('m1', 'x', 'them', t0), me: 'me'),
        isNull,
      );
    });

    test('unread stops at the server cap', () {
      final full = _conv('a', at: t0, unread: kChatUnreadCap);
      final next = applyNewMessage(
        [full],
        _msg('m1', 'a', 'them', t0.add(const Duration(seconds: 1))),
        me: 'me',
      )!;
      expect(next.single.unreadCount, kChatUnreadCap);
    });

    test('changed chats replace rows and join in order', () {
      final fresh = _conv('x', at: t0.add(const Duration(hours: 1)));
      final next = mergeChanged([p, b, a], [fresh]);
      expect(next.map((c) => c.id), ['p', 'x', 'b', 'a']);
    });
  });

  group('the notifier', () {
    late SocialLocalDatabase db;
    late StreamController<RealtimeEvent> events;
    late _Chats repo;
    late ProviderContainer c;

    setUp(() async {
      db = SocialLocalDatabase(NativeDatabase.memory());
      events = StreamController<RealtimeEvent>.broadcast();
      repo = _Chats([
        _conv('b', at: t0.add(const Duration(minutes: 1))),
        _conv('a', at: t0),
      ]);
      c = ProviderContainer(
        overrides: [
          socialLocalDatabaseProvider.overrideWithValue(db),
          currentUserIdProvider.overrideWithValue('me'),
          realtimeClientProvider.overrideWithValue(null),
          realtimeEventsProvider.overrideWithValue(events.stream),
          chatRepositoryProvider.overrideWithValue(repo),
          chatListCacheProvider.overrideWithValue(
            _NoCache(SavedJson(db, 'me')),
          ),
        ],
      )..listen(conversationsProvider, (_, __) {});
      await c.read(conversationsProvider.future);
      repo.calls.clear();
    });

    tearDown(() async {
      c.dispose();
      await events.close();
      await db.close();
    });

    Future<void> settle() =>
        Future<void>.delayed(const Duration(milliseconds: 700));

    List<Conversation> rows() =>
        c.read(conversationsProvider).requireValue.items;

    test('message, read and badge events update the list without a request',
        () async {
      events
        ..add(
          RealtimeEvent(
            'message:new',
            _event('m1', 'a', 'them', t0.add(const Duration(minutes: 5))),
          ),
        )
        ..add(const RealtimeEvent('badge:update', {'chats': 1}));
      await settle();
      expect(rows().map((e) => e.id), ['a', 'b']);
      expect(rows().first.unreadCount, 1);

      events.add(
        const RealtimeEvent('conversation:read', {'conversationId': 'a'}),
      );
      await settle();
      expect(rows().first.unreadCount, 0);

      events.add(
        RealtimeEvent('message:read', {
          'conversationId': 'b',
          'lastReadMessageId': 'mb',
          'readAt': t0.toIso8601String(),
        }),
      );
      await settle();
      expect(rows()[1].counterpartLastReadId, 'mb');
      expect(repo.calls, isEmpty);
    });

    test('a reconnect asks only for what changed (updatedSince)', () async {
      repo.changed = [_conv('x', at: t0.add(const Duration(hours: 1)))];
      events.add(const RealtimeEvent(RealtimeEvent.reconnected, null));
      await settle();
      expect(repo.calls, hasLength(1));
      expect(repo.calls.single.cursor, isNull);
      // From the newest change the list knows (server time), a bit before.
      expect(
        repo.calls.single.updatedSince,
        t0.add(const Duration(minutes: 1)).subtract(const Duration(seconds: 2)),
      );
      expect(rows().map((e) => e.id), ['x', 'b', 'a']);
    });

    test('a message in a chat the list does not hold asks once, then not',
        () async {
      final at = t0.add(const Duration(minutes: 9));
      events.add(RealtimeEvent('message:new', _event('m1', 'z', 'them', at)));
      await settle();
      expect(repo.calls, hasLength(1));
      expect(repo.calls.single.updatedSince, isNotNull);
      // Not in this list (archived): the next one does not ask again.
      events.add(RealtimeEvent('message:new', _event('m2', 'z', 'them', at)));
      await settle();
      expect(repo.calls, hasLength(1));
    });
  });
}
