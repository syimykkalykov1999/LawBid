/// Owner 2026-10-20: the pure arithmetic and parsing of the "Time" tab —
/// kept free of widgets so it is tested on its own and matches the server's
/// `billing.math.ts` (whole minutes, a day at most, money in cents).
library;

/// The longest single entry the server accepts, in minutes.
const int maxEntryMinutes = 24 * 60;

/// Whole seconds from [since] to [now]; a device clock that runs behind the
/// server's never gives a negative timer.
int elapsedSeconds(DateTime since, DateTime now) {
  final s = now.difference(since).inSeconds;
  return s < 0 ? 0 : s;
}

/// The seconds a running entry shows: minutes counted before this run plus
/// the live run, never more than a day (a forgotten timer is not a 3-day line).
int liveSeconds({
  required int baseMinutes,
  required DateTime since,
  required DateTime now,
}) {
  final total = baseMinutes * 60 + elapsedSeconds(since, now);
  return total > maxEntryMinutes * 60 ? maxEntryMinutes * 60 : total;
}

/// `0:05:03` / `12:00:09` — a stopwatch face.
String clockText(int seconds) {
  final s = seconds < 0 ? 0 : seconds;
  final h = s ~/ 3600;
  final m = (s % 3600) ~/ 60;
  final sec = s % 60;
  return '$h:${m.toString().padLeft(2, '0')}:${sec.toString().padLeft(2, '0')}';
}

/// Minutes as whole hours and the rest.
({int hours, int minutes}) splitMinutes(int minutes) {
  final m = minutes < 0 ? 0 : minutes;
  return (hours: m ~/ 60, minutes: m % 60);
}

/// Hours and minutes typed in two fields → total minutes, or null when
/// both are empty, not numbers, or the sum is outside 1..[maxEntryMinutes].
int? parseDurationMinutes(String hours, String minutes) {
  final h = hours.trim().isEmpty ? 0 : int.tryParse(hours.trim());
  final m = minutes.trim().isEmpty ? 0 : int.tryParse(minutes.trim());
  if (h == null || m == null || h < 0 || m < 0) return null;
  final total = h * 60 + m;
  return total >= 1 && total <= maxEntryMinutes ? total : null;
}

/// `120`, `120.5`, `120,50`, `1 200.00` → cents; null for anything else
/// (a third decimal, a minus, letters, an empty text).
int? parseMoneyCents(String text) {
  final s = text.replaceAll(RegExp(r'[\s ]'), '');
  final m = RegExp(r'^(\d{1,9})(?:[.,](\d{1,2}))?$').firstMatch(s);
  if (m == null) return null;
  final whole = int.parse(m.group(1)!);
  final frac = (m.group(2) ?? '').padRight(2, '0');
  return whole * 100 + int.parse(frac.isEmpty ? '0' : frac);
}

/// Cents as an editable text: `12000` → `120`, `12050` → `120.50`.
String centsInputText(int cents) {
  final whole = cents ~/ 100;
  final frac = cents % 100;
  return frac == 0 ? '$whole' : '$whole.${frac.toString().padLeft(2, '0')}';
}

/// The calendar day sent to the server: midnight UTC, so the day never
/// shifts with the phone's time zone.
DateTime dayForServer(DateTime d) => DateTime.utc(d.year, d.month, d.day);

/// A server date (`2026-10-20`, or midnight UTC) as the same day on screen.
DateTime dayOnScreen(DateTime d) => DateTime(d.year, d.month, d.day);

/// [s] as a directionally isolated run (FSI … PDI): in a right-to-left
/// line the digits of "1 min", an amount or a date keep their own order and
/// do not merge with the neighbour across a " · ".
String isolate(String s) => '\u2068$s\u2069';
