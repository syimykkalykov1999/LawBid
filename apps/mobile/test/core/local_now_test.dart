import 'dart:ui';

// ignore: depend_on_referenced_packages
import 'package:fake_async/fake_async.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/week_start.dart';
import 'package:lawbid/core/time/local_now.dart';

/// Owner 2026-10-15: «today / tomorrow / overdue» and the week strip always
/// match the device's real local date — across midnight, a night in the
/// background and a change of the time zone.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('moves to the next day at local midnight', () {
    fakeAsync((async) {
      var now = DateTime(2026, 10, 15, 23, 59, 30); // Thursday evening
      final c = ProviderContainer(
        overrides: [appClockProvider.overrideWithValue(() => now)],
      );
      addTearDown(c.dispose);
      final seen = <DateTime>[];
      c.listen(localNowProvider, (_, v) => seen.add(v), fireImmediately: true);
      expect(c.read(localNowProvider).day, 15);

      now = DateTime(2026, 10, 16, 0, 0, 1);
      async.elapse(const Duration(seconds: 31));
      expect(c.read(localNowProvider).day, 16, reason: 'Friday after midnight');
      expect(c.read(localNowProvider).weekday, DateTime.friday);
    });
  });

  test('refresh (the app comes back) reads the clock again', () {
    fakeAsync((async) {
      var now = DateTime(2026, 10, 15, 22);
      final c = ProviderContainer(
        overrides: [appClockProvider.overrideWithValue(() => now)],
      );
      addTearDown(c.dispose);
      expect(c.read(localNowProvider).day, 15);
      // A night in the background, then another time zone: the clock jumps.
      now = DateTime(2026, 10, 17, 7, 30);
      c.read(localNowProvider.notifier).didChangeAppLifecycleState(
            AppLifecycleState.resumed,
          );
      expect(c.read(localNowProvider), DateTime(2026, 10, 17, 7, 30));
    });
  });

  group('week start follows the locale', () {
    test('Russia starts on Monday, the US on Sunday, Egypt on Saturday', () {
      expect(firstWeekdayFor(const Locale('ru', 'RU')), DateTime.monday);
      expect(firstWeekdayFor(const Locale('en', 'US')), DateTime.sunday);
      expect(firstWeekdayFor(const Locale('ar', 'EG')), DateTime.saturday);
      expect(firstWeekdayFor(const Locale('de')), DateTime.monday);
      expect(firstWeekdayFor(const Locale('en')), DateTime.sunday);
    });

    test('the strip is the real week of today', () {
      final friday = DateTime(2026, 10, 16, 15);
      expect(weekStartOf(friday, DateTime.monday), DateTime(2026, 10, 12));
      expect(weekStartOf(friday, DateTime.sunday), DateTime(2026, 10, 11));
      expect(weekStartOf(friday, DateTime.saturday), DateTime(2026, 10, 10));
      // A Sunday is the last day of a Monday week, the first of a Sunday one.
      final sunday = DateTime(2026, 10, 18);
      expect(weekStartOf(sunday, DateTime.monday), DateTime(2026, 10, 12));
      expect(weekStartOf(sunday, DateTime.sunday), DateTime(2026, 10, 18));
    });
  });

  test("a server UTC time is shown on the viewer's local day", () {
    final utc = DateTime.parse('2026-10-15T23:30:00Z');
    final local = utc.toLocal();
    expect(local.isUtc, isFalse);
    expect(local.toUtc(), utc);
  });
}
