import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/persistence/saved_json.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_list_cache.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../helpers/upload_queue_overrides.dart';

/// Owner 2026-10-20 (speed, Telegram): the inbox opens on the saved list and
/// the live one replaces it; folders other than "All" and searches never use
/// the saved list.
Conversation _conv(String id) => Conversation(
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
    );

class _Cache extends ChatListCache {
  _Cache(super.saved, this.page);

  final CursorPage<Conversation>? page;

  @override
  Future<CursorPage<Conversation>?> read() async => page;
}

class _Chats implements ChatRepository {
  _Chats(this.live);

  final Future<CursorPage<Conversation>> Function() live;

  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) =>
      live();

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

void main() {
  late SocialLocalDatabase db;
  setUp(() => db = SocialLocalDatabase(NativeDatabase.memory()));
  tearDown(() => db.close());

  ProviderContainer container({
    required Future<CursorPage<Conversation>> Function() live,
    CursorPage<Conversation>? saved,
  }) {
    final c = ProviderContainer(
      overrides: [
        socialLocalDatabaseProvider.overrideWithValue(db),
        ...uploadQueueOverrides(),
        currentUserIdProvider.overrideWithValue('me'),
        realtimeClientProvider.overrideWithValue(null),
        chatRepositoryProvider.overrideWithValue(_Chats(live)),
        chatListCacheProvider.overrideWithValue(
          _Cache(SavedJson(db, 'me'), saved),
        ),
      ],
    );
    addTearDown(c.dispose);
    return c;
  }

  Future<void> settle() =>
      Future<void>.delayed(const Duration(milliseconds: 20));

  test('the inbox opens on the saved list, then the live one replaces it',
      () async {
    final live = Completer<CursorPage<Conversation>>();
    final c = container(
      live: () => live.future,
      saved: CursorPage(items: [_conv('old')]),
    );
    final first = await c.read(conversationsProvider.future);
    expect(first.items.map((e) => e.id), ['old']);

    live.complete(CursorPage(items: [_conv('new'), _conv('old')]));
    await settle();
    expect(
      c.read(conversationsProvider).requireValue.items.map((e) => e.id),
      ['new', 'old'],
    );
  });

  test('offline behind a saved list: the saved list stays', () async {
    final c = container(
      live: () async => throw StateError('offline'),
      saved: CursorPage(items: [_conv('old')]),
    );
    await c.read(conversationsProvider.future);
    await settle();
    expect(
      c.read(conversationsProvider).requireValue.items.map((e) => e.id),
      ['old'],
    );
  });

  test('another folder, a search and the requests list ignore the saved list',
      () async {
    final c = container(
      live: () async => CursorPage(items: [_conv('live')]),
      saved: CursorPage(items: [_conv('old')]),
    );
    final waiting = await c.read(
      folderConversationsProvider(ChatListFolder.waiting).future,
    );
    expect(waiting.items.map((e) => e.id), ['live']);
    final search = await c.read(
      searchConversationsProvider(
        (folder: ChatListFolder.all, q: 'x'),
      ).future,
    );
    expect(search.items.map((e) => e.id), ['live']);
    final requests = await c.read(messageRequestsProvider.future);
    expect(requests.items.map((e) => e.id), ['live']);
  });

  group('SavedJson', () {
    SavedJson sj(String? owner) => SavedJson(db, owner);

    test('keeps a copy per account and name', () async {
      sj('a').save('chats', {'x': 1});
      sj('b').save('chats', {'x': 2});
      sj('a').save('profile', {'x': 3});
      await settle();
      expect(await sj('a').read('chats'), {'x': 1});
      expect(await sj('b').read('chats'), {'x': 2});
      expect(await sj('a').read('profile'), {'x': 3});
      expect(await sj('c').read('chats'), isNull);
    });

    test('signed out: nothing is saved or read', () async {
      sj(null).save('chats', {'x': 1});
      expect(await sj(null).read('chats'), isNull);
    });

    test('an unreadable copy is "no copy"', () async {
      await db.savePage('chats:a', 'not json');
      expect(await sj('a').read('chats'), isNull);
    });
  });
}
