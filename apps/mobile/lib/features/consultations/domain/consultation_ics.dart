import 'dart:convert';

/// RFC 5545 text escaping: backslash, semicolon, comma, newline.
String icsEscape(String v) => v
    .replaceAll(r'\', r'\\')
    .replaceAll(';', r'\;')
    .replaceAll(',', r'\,')
    .replaceAll('\r\n', r'\n')
    .replaceAll('\n', r'\n')
    .replaceAll('\r', r'\n');

String _stamp(DateTime d) {
  final u = d.toUtc();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${u.year.toString().padLeft(4, '0')}${two(u.month)}${two(u.day)}'
      'T${two(u.hour)}${two(u.minute)}${two(u.second)}Z';
}

/// Folds a content line to 75 octets (continuation lines start with one
/// space), never splitting a UTF-8 character.
List<String> icsFold(String line) {
  if (utf8.encode(line).length <= 75) return [line];
  final out = <String>[];
  var current = StringBuffer();
  var used = 0;
  var limit = 75;
  for (final rune in line.runes) {
    final ch = String.fromCharCode(rune);
    final n = utf8.encode(ch).length;
    if (used + n > limit) {
      out.add(current.toString());
      current = StringBuffer(' ');
      used = 1;
      limit = 75;
    }
    current.write(ch);
    used += n;
  }
  out.add(current.toString());
  return out;
}

/// One-event calendar file (`text/calendar`) for a booked consultation,
/// the same for both sides. [now] is injectable for tests.
String buildConsultationIcs({
  required String id,
  required String summary,
  required DateTime startsAt,
  required DateTime endsAt,
  required bool confirmed,
  String? description,
  DateTime? now,
}) {
  final lines = <String>[
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LawBid//Consultation//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:consultation-$id@lawbid.dev',
    'DTSTAMP:${_stamp(now ?? DateTime.now())}',
    'DTSTART:${_stamp(startsAt)}',
    'DTEND:${_stamp(endsAt)}',
    'SUMMARY:${icsEscape(summary)}',
    if (description != null && description.trim().isNotEmpty)
      'DESCRIPTION:${icsEscape(description.trim())}',
    'STATUS:${confirmed ? 'CONFIRMED' : 'TENTATIVE'}',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:${icsEscape(summary)}',
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return '${[for (final l in lines) ...icsFold(l)].join('\r\n')}\r\n';
}
