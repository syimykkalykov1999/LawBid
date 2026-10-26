import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/application/chat_counts_refresh.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/social/application/social_providers.dart'
    show currentUserIdProvider;

/// Delta audit P1: the folder badges are not re-read on every message.
RealtimeEvent _msg(String chat, String sender, [String id = 'm']) =>
    RealtimeEvent('message:new', {
      'message': {
        'id': '$id-$chat-$sender-${DateTime.now().microsecondsSinceEpoch}',
        'conversationId': chat,
        'senderId': sender,
        'type': 'text',
        'body': 'hi',
        'contactMasked': false,
        'createdAt': DateTime.utc(2026, 10, 25).toIso8601String(),
        'revoked': false,
        'forwarded': false,
        'reactions': <Object?>[],
        'pinned': false,
      },
    });

class _Repo implements ChatRepository {
  int folderCalls = 0;
  int requestCalls = 0;

  @override
  Future<({int waiting, int requests, int cases, int archived})>
      folderCounts() async {
    folderCalls++;
    return (waiting: 0, requests: 0, cases: 0, archived: 0);
  }

  @override
  Future<int> requestsCount() async {
    requestCalls++;
    return 0;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

void main() {
  group('ChatCountsGate', () {
    test('asks on the first sight of a chat and when the side flips only', () {
      final gate = ChatCountsGate(me: () => 'me');
      expect(gate.onMessage(_msg('a', 'them')).waiting, isTrue); // new chat
      expect(gate.onMessage(_msg('a', 'them')).waiting, isFalse); // same side
      expect(gate.onMessage(_msg('a', 'them')).waiting, isFalse);
      expect(gate.onMessage(_msg('a', 'me')).waiting, isTrue); // I answered
      expect(gate.onMessage(_msg('a', 'me')).waiting, isFalse);
      expect(gate.onMessage(_msg('a', 'them')).waiting, isTrue); // flips back
    });

    test('requests: only a chat not seen before can add one', () {
      final gate = ChatCountsGate(me: () => 'me');
      expect(gate.onMessage(_msg('a', 'them')).requests, isTrue);
      expect(gate.onMessage(_msg('a', 'me')).requests, isFalse);
      expect(gate.onMessage(_msg('a', 'them')).requests, isFalse);
      expect(gate.onMessage(_msg('b', 'them')).requests, isTrue);
    });
  });

  group('CountsDebouncer', () {
    test('a burst collapses into one refresh', () async {
      var n = 0;
      final d = CountsDebouncer(
        () => n++,
        delay: const Duration(milliseconds: 40),
      );
      for (var i = 0; i < 10; i++) {
        d.poke();
      }
      expect(n, 0);
      await Future<void>.delayed(const Duration(milliseconds: 120));
      expect(n, 1);
      d.dispose();
    });
  });

  group('the providers', () {
    late StreamController<RealtimeEvent> events;
    late _Repo repo;
    late ProviderContainer c;

    setUp(() async {
      events = StreamController<RealtimeEvent>.broadcast();
      repo = _Repo();
      c = ProviderContainer(
        overrides: [
          currentUserIdProvider.overrideWithValue('me'),
          realtimeEventsProvider.overrideWithValue(events.stream),
          chatRepositoryProvider.overrideWithValue(repo),
        ],
      )
        ..listen(chatFolderCountsProvider, (_, __) {})
        ..listen(messageRequestsCountProvider, (_, __) {});
      await c.read(chatFolderCountsProvider.future);
      await c.read(messageRequestsCountProvider.future);
    });

    tearDown(() async {
      c.dispose();
      await events.close();
    });

    test('same-side messages in an active chat cost no request', () async {
      // The first message of a chat is "new" and asks once (debounced).
      events.add(_msg('a', 'them'));
      await Future<void>.delayed(const Duration(milliseconds: 2400));
      final folderAfterFirst = repo.folderCalls;
      final requestAfterFirst = repo.requestCalls;
      expect(folderAfterFirst, 2);
      expect(requestAfterFirst, 2);
      // Thirty more messages from the same side: nothing.
      for (var i = 0; i < 30; i++) {
        events.add(_msg('a', 'them'));
      }
      await Future<void>.delayed(const Duration(milliseconds: 2400));
      expect(repo.folderCalls, folderAfterFirst);
      expect(repo.requestCalls, requestAfterFirst);
    });

    test('conversation:update bursts are debounced into one read', () async {
      for (var i = 0; i < 5; i++) {
        events.add(const RealtimeEvent('conversation:update', {}));
      }
      await Future<void>.delayed(const Duration(milliseconds: 2400));
      expect(repo.folderCalls, 2);
      expect(repo.requestCalls, 2);
    });
  });
}
