import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/consultations/domain/consultation_ics.dart';
import 'package:lawbid/features/consultations/domain/consultation_models.dart';

void main() {
  final starts = DateTime.utc(2026, 10, 21, 14);
  final ends = DateTime.utc(2026, 10, 21, 14, 30);
  final now = DateTime.utc(2026, 10, 20, 9, 5, 7);

  test('one VEVENT in UTC with CRLF lines and an alarm', () {
    final ics = buildConsultationIcs(
      id: 'abc',
      summary: 'Consultation: Ann',
      startsAt: starts,
      endsAt: ends,
      confirmed: true,
      now: now,
    );
    expect(ics, startsWith('BEGIN:VCALENDAR\r\n'));
    expect(ics, endsWith('END:VCALENDAR\r\n'));
    expect(ics, contains('UID:consultation-abc@lawbid.dev\r\n'));
    expect(ics, contains('DTSTAMP:20261020T090507Z\r\n'));
    expect(ics, contains('DTSTART:20261021T140000Z\r\n'));
    expect(ics, contains('DTEND:20261021T143000Z\r\n'));
    expect(ics, contains('STATUS:CONFIRMED\r\n'));
    expect(ics, contains('TRIGGER:-PT1H\r\n'));
    expect(ics.split('BEGIN:VEVENT').length, 2);
  });

  test('an unanswered request is TENTATIVE', () {
    final ics = buildConsultationIcs(
      id: 'x',
      summary: 's',
      startsAt: starts,
      endsAt: ends,
      confirmed: false,
      now: now,
    );
    expect(ics, contains('STATUS:TENTATIVE\r\n'));
  });

  test('text is escaped and long lines are folded at 75 octets', () {
    expect(icsEscape('a,b;c\\d\ne'), r'a\,b\;c\\d\ne');
    final ics = buildConsultationIcs(
      id: 'x',
      summary: 'Привет, мир',
      startsAt: starts,
      endsAt: ends,
      confirmed: true,
      description: List.filled(40, 'Юрист').join(' '),
      now: now,
    );
    expect(ics, contains(r'SUMMARY:Привет\, мир'));
    for (final line in ics.split('\r\n')) {
      expect(
        line.runes.map(String.fromCharCode).join().length,
        lessThanOrEqualTo(75),
      );
    }
    // A folded line continues with one space.
    expect(ics, contains('\r\n '));
  });

  test('iso day helpers do calendar arithmetic', () {
    expect(addIsoDays('2026-12-30', 3), '2027-01-02');
    expect(isoDay(DateTime(2026, 3, 5)), '2026-03-05');
    final slot = ConsultationSlot(
      startsAt: starts,
      local: '2026-10-21T10:00',
    );
    expect(slot.localDate, '2026-10-21');
    expect(slot.localClock.hour, 10);
  });
}
