import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// "Now" for the whole app — overridable so tests are deterministic.
final appClockProvider = Provider<DateTime Function()>((ref) => DateTime.now);

/// Owner 2026-10-15: every «today / tomorrow / overdue» and the week strip
/// read the device's real local time, never a value captured once. It moves
/// at every minute boundary (so at local midnight too) and again when the
/// app returns to the foreground — after a night in the background, or a
/// change of the time zone, it never shows yesterday's day.
class LocalNow extends Notifier<DateTime> with WidgetsBindingObserver {
  Timer? _timer;

  @override
  DateTime build() {
    final clock = ref.watch(appClockProvider);
    WidgetsBinding.instance.addObserver(this);
    ref.onDispose(() {
      _timer?.cancel();
      WidgetsBinding.instance.removeObserver(this);
    });
    final now = clock();
    _schedule(now);
    return now;
  }

  void _schedule(DateTime now) {
    _timer?.cancel();
    // Up to the next whole minute: covers the midnight rollover.
    final next = DateTime(now.year, now.month, now.day, now.hour, now.minute)
        .add(const Duration(minutes: 1));
    var wait = next.difference(now);
    if (wait <= Duration.zero) wait = const Duration(minutes: 1);
    _timer = Timer(wait, refresh);
  }

  /// Re-reads the clock (the timer, the app resume, tests).
  void refresh() {
    final now = ref.read(appClockProvider)();
    state = now;
    _schedule(now);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) refresh();
  }
}

final localNowProvider = NotifierProvider<LocalNow, DateTime>(LocalNow.new);
