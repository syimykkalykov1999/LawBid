import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// Owner 2026-11-11 (speed, Telegram): a chat folder and «Requests» open at
/// once on the page this phone showed last time; the live page swaps in
/// behind it, no extra request.
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

class _Chats implements ChatRepository {
  final live = Completer<CursorPage<Conversation>>();
  CursorPage<Conversation>? copy;
  int liveReads = 0;

  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) async {
    if (readingFromPhoneOnly) {
      final c = copy;
      if (c == null) throw StateError(kNoPhoneCopy);
      return c;
    }
    liveReads++;
    return live.future;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

void main() {
  late _Chats repo;
  late ProviderContainer c;
  late StreamController<RealtimeEvent> events;

  setUp(() {
    repo = _Chats();
    events = StreamController<RealtimeEvent>.broadcast();
    c = ProviderContainer(
      overrides: [
        chatRepositoryProvider.overrideWithValue(repo),
        realtimeEventsProvider.overrideWithValue(events.stream),
      ],
    );
  });

  tearDown(() async {
    c.dispose();
    await events.close();
  });

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  for (final (name, provider) in [
    ('«Requests»', messageRequestsProvider),
    (
      'the «Waiting» folder',
      folderConversationsProvider(ChatListFolder.waiting)
    ),
  ]) {
    test('$name opens on the phone copy before the server answers', () async {
      repo.copy = CursorPage(items: [_conv('old')]);
      c.listen(provider, (_, __) {});
      final first = await c.read(provider.future);
      expect(first.items.map((e) => e.id), ['old']);

      repo.live.complete(CursorPage(items: [_conv('new'), _conv('old')]));
      await settle();
      await settle();
      expect(
        c.read(provider).requireValue.items.map((e) => e.id),
        ['new', 'old'],
      );
      expect(repo.liveReads, 1);
    });
  }

  test('no copy on the phone: loads from the server as before', () async {
    repo.live.complete(CursorPage(items: [_conv('a')]));
    c.listen(messageRequestsProvider, (_, __) {});
    final first = await c.read(messageRequestsProvider.future);
    expect(first.items.map((e) => e.id), ['a']);
    expect(repo.liveReads, 1);
  });
}
