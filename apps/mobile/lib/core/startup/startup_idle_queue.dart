import 'dart:async';

import 'package:flutter/scheduler.dart';

/// S16-3: non-critical start-up work (the phone-book hash pass, nudges,
/// warm-ups) runs when the first content is on screen and the UI isolate
/// is idle — Meta's "defer non-critical init to idle after first content"
/// and Android's "defer work after the first frame" advice — not in the
/// same frames as the first feed paint.
///
/// Each job waits `delay` after it is queued, then runs as a scheduler task
/// at idle priority (not while an animation is running). Jobs are spaced
/// `gap` apart so two heavy ones never land in one frame. Errors are
/// swallowed: these are background jobs.
class StartupIdleQueue {
  StartupIdleQueue._();

  static Duration _next = Duration.zero;

  /// Test hook: no waiting, no spacing.
  static bool immediate = false;

  static void enqueue(
    FutureOr<void> Function() job, {
    Duration delay = const Duration(milliseconds: 1500),
    Duration gap = const Duration(milliseconds: 400),
  }) {
    if (immediate) {
      unawaited(Future<void>.sync(job).catchError((Object _) {}));
      return;
    }
    final wait = delay + _next;
    _next += gap;
    Timer(wait, () {
      _next = _next > gap ? _next - gap : Duration.zero;
      unawaited(
        SchedulerBinding.instance.scheduleTask<void>(
          () async {
            try {
              await job();
            } on Object {
              // Background job: nothing to tell anyone.
            }
          },
          Priority.idle,
        ),
      );
    });
  }
}
