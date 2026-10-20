import 'dart:convert';

/// Owner 2026-10-20: an all-day `.ics` event for a computed deadline —
/// RFC 5545, escaped text, lines folded at 75 octets, CRLF endings.
String buildDeadlineIcs({
  required String uid,
  required String title,
  required DateTime date,
  required DateTime stamp,
  String? description,
  int alarmDaysBefore = 1,
}) {
  final lines = <String>[
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LawBid//Deadlines//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:${_text(uid)}',
    'DTSTAMP:${_utc(stamp)}',
    'DTSTART;VALUE=DATE:${_day(date)}',
    'DTEND;VALUE=DATE:${_day(DateTime(date.year, date.month, date.day + 1))}',
    'SUMMARY:${_text(title)}',
    if (description != null && description.trim().isNotEmpty)
      'DESCRIPTION:${_text(description)}',
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:${_text(title)}',
    'TRIGGER:-P${alarmDaysBefore}D',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return '${lines.map(_fold).join('\r\n')}\r\n';
}

String _two(int n) => n.toString().padLeft(2, '0');

String _day(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}${_two(d.month)}${_two(d.day)}';

String _utc(DateTime d) {
  final u = d.toUtc();
  return '${_day(u)}T${_two(u.hour)}${_two(u.minute)}${_two(u.second)}Z';
}

String _text(String s) => s
    .replaceAll(r'\', r'\\')
    .replaceAll(';', r'\;')
    .replaceAll(',', r'\,')
    .replaceAll('\r\n', r'\n')
    .replaceAll('\n', r'\n')
    .replaceAll('\r', r'\n');

/// Folds a content line so no physical line exceeds 75 octets, never
/// splitting a UTF-8 character.
String _fold(String line) {
  if (utf8.encode(line).length <= 75) return line;
  final out = StringBuffer();
  var bytes = 0;
  var limit = 75;
  for (final rune in line.runes) {
    final ch = String.fromCharCode(rune);
    final n = utf8.encode(ch).length;
    if (bytes + n > limit) {
      out.write('\r\n ');
      bytes = 1;
      limit = 75;
    }
    out.write(ch);
    bytes += n;
  }
  return out.toString();
}
