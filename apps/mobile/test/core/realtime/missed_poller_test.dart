// ignore_for_file: cascade_invocations, unawaited_futures

import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/realtime/missed_poller.dart';

void main() {
  const interval = Duration(seconds: 30);

  ({MissedPoller poller, List<int> polls, _State state}) make({
    Future<void> Function()? onPoll,
  }) {
    final state = _State();
    final polls = <int>[];
    final poller = MissedPoller(
      interval: () => interval,
      canPoll: () => state.foreground && !state.connected,
      poll: () async {
        polls.add(polls.length);
        await onPoll?.call();
      },
    );
    return (poller: poller, polls: polls, state: state);
  }

  test('first poll one interval after the socket drops, then every interval',
      () {
    fakeAsync((async) {
      final t = make();
      t.poller.start();
      async.elapse(const Duration(seconds: 29));
      expect(t.polls, isEmpty);
      async.elapse(const Duration(seconds: 1));
      expect(t.polls, hasLength(1));
      async.elapse(const Duration(seconds: 90));
      expect(t.polls, hasLength(4));
    });
  });

  test('a socket that is back before the interval never polls', () {
    fakeAsync((async) {
      final t = make();
      t.poller.start();
      async.elapse(const Duration(seconds: 20));
      t.state.connected = true;
      t.poller.stop();
      async.elapse(const Duration(minutes: 5));
      expect(t.polls, isEmpty);
      expect(t.poller.running, isFalse);
    });
  });

  test('stops at once when the app goes to the background', () {
    fakeAsync((async) {
      final t = make();
      t.poller.start();
      async.elapse(const Duration(seconds: 65));
      expect(t.polls, hasLength(2));
      t.state.foreground = false;
      t.poller.stop();
      async.elapse(const Duration(minutes: 5));
      expect(t.polls, hasLength(2));
    });
  });

  test('does not start in the background or while connected', () {
    fakeAsync((async) {
      final t = make();
      t.state.foreground = false;
      t.poller.start();
      expect(t.poller.running, isFalse);
      t.state.foreground = true;
      t.state.connected = true;
      t.poller.start();
      expect(t.poller.running, isFalse);
      async.elapse(const Duration(minutes: 5));
      expect(t.polls, isEmpty);
    });
  });

  test('stops by itself when the conditions went away without a stop()', () {
    fakeAsync((async) {
      final t = make();
      t.poller.start();
      async.elapse(const Duration(seconds: 30));
      expect(t.polls, hasLength(1));
      t.state.connected = true;
      async.elapse(const Duration(minutes: 5));
      expect(t.polls, hasLength(1));
      expect(t.poller.running, isFalse);
    });
  });

  test('a failing poll does not end the polling', () {
    fakeAsync((async) {
      final t = make(onPoll: () async => throw StateError('offline'));
      t.poller.start();
      async.elapse(const Duration(seconds: 95));
      expect(t.polls, hasLength(3));
    });
  });

  test('start() twice arms one timer; stop() then start() restarts the clock',
      () {
    fakeAsync((async) {
      final t = make();
      t.poller.start();
      t.poller.start();
      async.elapse(const Duration(seconds: 30));
      expect(t.polls, hasLength(1));
      t.poller.stop();
      async.elapse(const Duration(seconds: 20));
      t.poller.start();
      async.elapse(const Duration(seconds: 29));
      expect(t.polls, hasLength(1));
      async.elapse(const Duration(seconds: 1));
      expect(t.polls, hasLength(2));
    });
  });

  test('a slow poll is not overlapped by the next tick', () {
    fakeAsync((async) {
      final t = make(
        onPoll: () => Future<void>.delayed(const Duration(seconds: 50)),
      );
      t.poller.start();
      async.elapse(const Duration(seconds: 30));
      expect(t.polls, hasLength(1));
      // The request ends at 80 s; the next timer is armed then, fires at 110.
      async.elapse(const Duration(seconds: 79));
      expect(t.polls, hasLength(1));
      async.elapse(const Duration(seconds: 1));
      expect(t.polls, hasLength(2));
    });
  });
}

class _State {
  bool foreground = true;
  bool connected = false;
}
