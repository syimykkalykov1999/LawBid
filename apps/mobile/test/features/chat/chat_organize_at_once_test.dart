import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/api_error.dart';
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

/// Owner 26.11 (Telegram, WhatsApp): my own pin / mute / archive / delete
/// of a chat shows in every chat list at once, before the server answers;
/// a refusal puts every list back as it was.
Conversation _conv(String id, {required DateTime at, DateTime? pinnedAt}) =>
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
      unreadCount: 0,
      lastMessageAt: at,
      updatedAt: at,
      pinnedAt: pinnedAt,
    );

class _Chats implements ChatRepository {
  _Chats(this.first);

  final List<Conversation> first;

  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) async =>
      CursorPage(items: updatedSince == null ? first : const []);

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

class _NoCache extends ChatListCache {
  _NoCache(super.saved);

  @override
  Future<CursorPage<Conversation>?> read() async => null;
}

final t0 = DateTime.utc(2026, 11, 26, 9);

void main() {
  late SocialLocalDatabase db;
  late StreamController<RealtimeEvent> events;
  late ProviderContainer c;

  setUp(() async {
    db = SocialLocalDatabase(NativeDatabase.memory());
    events = StreamController<RealtimeEvent>.broadcast();
    final repo = _Chats([
      _conv('b', at: t0.add(const Duration(minutes: 1))),
      _conv('a', at: t0),
    ]);
    c = ProviderContainer(
      overrides: [
        socialLocalDatabaseProvider.overrideWithValue(db),
        ...uploadQueueOverrides(),
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
  });

  tearDown(() async {
    c.dispose();
    await events.close();
    await db.close();
  });

  List<Conversation> rows() => c.read(conversationsProvider).requireValue.items;
  Conversation row(String id) => rows().firstWhere((x) => x.id == id);
  ChatListsHub hub() => c.read(chatListsHubProvider);

  test('a pin moves the chat to the top before the answer', () async {
    final answer = Completer<Conversation>();
    final pending = hub().run(
      'a',
      change: (x) => x.withMine(pinned: true),
      call: () => answer.future,
    );
    expect(rows().map((x) => x.id), ['a', 'b']);
    expect(row('a').pinned, isTrue);
    answer.complete(_conv('a', at: t0, pinnedAt: t0));
    await pending;
    expect(row('a').pinned, isTrue);
  });

  test('a refused pin puts the list back and rethrows', () async {
    final answer = Completer<Conversation>();
    final pending = hub().run(
      'a',
      change: (x) => x.withMine(pinned: true),
      call: () => answer.future,
    );
    expect(rows().first.id, 'a');
    answer.completeError(
      const ApiException(code: ApiErrorCodes.internalError, message: 'x'),
    );
    await expectLater(pending, throwsA(isA<ApiException>()));
    expect(rows().map((x) => x.id), ['b', 'a']);
    expect(row('a').pinned, isFalse);
  });

  test('a mute shows the mark at once; unmute takes it off', () async {
    final until = DateTime.now().add(const Duration(hours: 8));
    final answer = Completer<Conversation>();
    final pending = hub().run(
      'b',
      change: (x) => x.withMine(mutedUntil: until),
      call: () => answer.future,
    );
    expect(row('b').muted, isTrue);
    answer.complete(row('b'));
    await pending;

    final back = Completer<Conversation>();
    final off = hub().run(
      'b',
      change: (x) => x.withMine(unmute: true),
      call: () => back.future,
    );
    expect(row('b').muted, isFalse);
    back.completeError(
      const ApiException(code: ApiErrorCodes.internalError, message: 'x'),
    );
    await expectLater(off, throwsA(isA<ApiException>()));
    expect(row('b').muted, isTrue, reason: 'the refusal restores the mute');
  });

  test('archive / delete: the row leaves at once, comes back on a refusal',
      () async {
    final answer = Completer<Conversation>();
    final pending = hub().run('a', leaves: true, call: () => answer.future);
    expect(rows().map((x) => x.id), ['b']);
    answer.completeError(
      const ApiException(code: ApiErrorCodes.internalError, message: 'x'),
    );
    await expectLater(pending, throwsA(isA<ApiException>()));
    expect(rows().map((x) => x.id), ['b', 'a']);

    final ok = Completer<Conversation>();
    final gone = hub().run('a', leaves: true, call: () => ok.future);
    ok.complete(_conv('a', at: t0));
    await gone;
    expect(rows().map((x) => x.id), ['b']);
  });
}
