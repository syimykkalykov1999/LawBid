import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/cases/tools/billing_logic.dart';

void main() {
  group('timer', () {
    final since = DateTime.utc(2026, 10, 20, 9);

    test('elapsed seconds never go negative (device clock behind)', () {
      expect(elapsedSeconds(since, since.add(const Duration(seconds: 75))), 75);
      expect(
          elapsedSeconds(since, since.subtract(const Duration(hours: 1))), 0);
    });

    test('a live run adds to the minutes counted before it', () {
      expect(
        liveSeconds(
          baseMinutes: 10,
          since: since,
          now: since.add(const Duration(seconds: 30)),
        ),
        630,
      );
    });

    test('a forgotten timer stops at a day', () {
      expect(
        liveSeconds(
          baseMinutes: 0,
          since: since,
          now: since.add(const Duration(days: 3)),
        ),
        maxEntryMinutes * 60,
      );
    });

    test('clock face', () {
      expect(clockText(0), '0:00:00');
      expect(clockText(303), '0:05:03');
      expect(clockText(12 * 3600 + 9), '12:00:09');
      expect(clockText(-5), '0:00:00');
    });
  });

  group('duration', () {
    test('splits minutes', () {
      expect(splitMinutes(125), (hours: 2, minutes: 5));
      expect(splitMinutes(45), (hours: 0, minutes: 45));
    });

    test('hours and minutes fields', () {
      expect(parseDurationMinutes('1', '30'), 90);
      expect(parseDurationMinutes('', '45'), 45);
      expect(parseDurationMinutes('2', ''), 120);
      expect(parseDurationMinutes('', ''), isNull);
      expect(parseDurationMinutes('0', '0'), isNull);
      expect(parseDurationMinutes('24', '1'), isNull);
      expect(parseDurationMinutes('24', '0'), 1440);
      expect(parseDurationMinutes('x', '5'), isNull);
      expect(parseDurationMinutes('-1', '5'), isNull);
    });
  });

  group('money', () {
    test('parses what people type into cents', () {
      expect(parseMoneyCents('120'), 12000);
      expect(parseMoneyCents('120.5'), 12050);
      expect(parseMoneyCents('120,50'), 12050);
      expect(parseMoneyCents(' 1 200.00 '), 120000);
      expect(parseMoneyCents('0'), 0);
      expect(parseMoneyCents('0.07'), 7);
    });

    test('rejects the rest', () {
      for (final s in ['', 'abc', '-5', '1.234', '1..2', '1,', '.5']) {
        expect(parseMoneyCents(s), isNull, reason: s);
      }
    });

    test('cents as an editable text round-trips', () {
      for (final c in [0, 7, 100, 12050, 12000]) {
        expect(parseMoneyCents(centsInputText(c)), c);
      }
      expect(centsInputText(12000), '120');
      expect(centsInputText(12050), '120.50');
    });
  });

  group('calendar days', () {
    test('a day keeps its date in any time zone', () {
      final d = dayForServer(DateTime(2026, 10, 20, 23, 30));
      expect(d.isUtc, isTrue);
      expect((d.year, d.month, d.day), (2026, 10, 20));
      final shown = dayOnScreen(DateTime.utc(2026, 10, 20));
      expect((shown.year, shown.month, shown.day), (2026, 10, 20));
      expect(shown.isUtc, isFalse);
    });
  });
}
