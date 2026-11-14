import 'dart:async';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/groups/application/group_typing.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

/// D1-2 (13.11): «Анна печатает…» in a group, as in Telegram / WhatsApp.
void main() {
  const g = 'g1';

  RealtimeEvent typing(String uid, {bool on = true, bool voice = false}) =>
      RealtimeEvent('typing', {
        'conversationId': g,
        'userId': uid,
        'typing': on,
        'kind': voice ? 'voice' : 'text',
      });

  ({ProviderContainer c, StreamController<RealtimeEvent> events}) make() {
    final events = StreamController<RealtimeEvent>.broadcast();
    final c = ProviderContainer(
      overrides: [
        realtimeEventsProvider.overrideWithValue(events.stream),
        realtimeClientProvider.overrideWithValue(null),
        currentUserIdProvider.overrideWithValue('me'),
      ],
    )..listen(groupTypingProvider(g), (_, __) {});
    return (c: c, events: events);
  }

  test('shows the latest typer, one stopping clears only them', () {
    fakeAsync((async) {
      final t = make();
      t.events
        ..add(typing('anna'))
        ..add(typing('bob', voice: true));
      async.flushMicrotasks();
      expect(t.c.read(groupTypingProvider(g)), (userId: 'bob', voice: true));
      t.events.add(typing('bob', on: false));
      async.flushMicrotasks();
      expect(t.c.read(groupTypingProvider(g)), (userId: 'anna', voice: false));
      t.c.dispose();
    });
  });

  test('my own typing, other chats and a 5 s silence show nothing', () {
    fakeAsync((async) {
      final t = make();
      t.events
        ..add(typing('me'))
        ..add(
          const RealtimeEvent('typing', {
            'conversationId': 'other',
            'userId': 'anna',
            'typing': true,
          }),
        );
      async.flushMicrotasks();
      expect(t.c.read(groupTypingProvider(g)), isNull);
      t.events.add(typing('anna'));
      async
        ..flushMicrotasks()
        ..elapse(const Duration(seconds: 6));
      expect(t.c.read(groupTypingProvider(g)), isNull);
      t.c.dispose();
    });
  });

  test('a new message from the typer ends their «typing…» at once', () {
    fakeAsync((async) {
      final t = make();
      t.events.add(typing('anna'));
      async.flushMicrotasks();
      t.events.add(
        const RealtimeEvent('group:message', {
          'groupId': g,
          'message': {
            'sender': {'userId': 'anna'},
          },
        }),
      );
      async.flushMicrotasks();
      expect(t.c.read(groupTypingProvider(g)), isNull);
      t.c.dispose();
    });
  });
}
