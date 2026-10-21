import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/deadlines/domain/deadline_ics.dart';
import 'package:lawbid/features/deadlines/domain/deadline_models.dart';

void main() {
  final stamp = DateTime.utc(2026, 10, 20, 8, 5, 9);

  test('an all-day event ending the next day, CRLF, with an alarm', () {
    final ics = buildDeadlineIcs(
      uid: 'frcp_12a_answer-2026-10-05@lawbid.dev',
      title: 'Deadline: Answer',
      date: DateTime(2026, 10, 26),
      stamp: stamp,
    );
    expect(ics, startsWith('BEGIN:VCALENDAR\r\n'));
    expect(ics, endsWith('END:VCALENDAR\r\n'));
    expect(ics, contains('DTSTAMP:20261020T080509Z\r\n'));
    expect(ics, contains('DTSTART;VALUE=DATE:20261026\r\n'));
    expect(ics, contains('DTEND;VALUE=DATE:20261027\r\n'));
    expect(ics, contains('TRIGGER:-P1D\r\n'));
    expect(ics.replaceAll('\r\n', '').contains('\n'), isFalse);
  });

  test('the day after the 31st rolls over the month and the year', () {
    final ics = buildDeadlineIcs(
      uid: 'x',
      title: 't',
      date: DateTime(2026, 12, 31),
      stamp: stamp,
    );
    expect(ics, contains('DTEND;VALUE=DATE:20270101\r\n'));
  });

  test('text is escaped and long lines fold at 75 octets', () {
    final ics = buildDeadlineIcs(
      uid: 'x',
      title: r'a, b; c\d',
      date: DateTime(2026, 1, 2),
      stamp: stamp,
      description: 'Срок ${'очень длинный ' * 20}\nвторая строка',
    );
    expect(ics, contains(r'SUMMARY:a\, b\; c\\d'));
    for (final line in ics.split('\r\n')) {
      expect(utf8.encode(line).length, lessThanOrEqualTo(75));
    }
    // Unfolded, the description keeps its text and the escaped newline.
    final flat = ics.replaceAll('\r\n ', '');
    expect(flat, contains(r'\nвторая строка'));
    expect(flat, contains('Срок очень длинный'));
  });

  test('dates parse and print as local calendar days', () {
    final d = parseDeadlineDate('2026-10-05');
    expect(d, DateTime(2026, 10, 5));
    expect(deadlineDateIso(d), '2026-10-05');
    expect(deadlineDateIso(DateTime(2027, 1, 9)), '2027-01-09');
  });

  test('labels fall back to English, then to any text', () {
    expect(pickLabel({'en': 'A', 'ru': 'Б'}, 'ru'), 'Б');
    expect(pickLabel({'en': 'A'}, 'de'), 'A');
    expect(pickLabel({'fr': 'C'}, 'de'), 'C');
    expect(pickLabel(null, 'de'), '');
  });
}
