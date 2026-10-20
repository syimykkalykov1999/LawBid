// ignore_for_file: lines_longer_than_80_chars
// Owner 2026-10-20: the deadline calculator (Mine, a case) — compiled-in
// strings merged into StaticTranslatorRu/En.

const deadlineRu = <String, String>{
  'deadline.title': 'Сроки',
  'deadline.kind.court': 'Суд',
  'deadline.kind.statute': 'Давность',
  'deadline.state': 'Штат',
  'deadline.federal': 'Федеральные',
  'deadline.rule': 'Правило',
  'deadline.noRules': 'Правил нет',
  'deadline.date': 'Дата события',
  'deadline.result': 'Результат',
  'deadline.due': 'Последний день',
  'deadline.unit.day': 'дн.',
  'deadline.unit.month': 'мес.',
  'deadline.unit.year': 'г.',
  'deadline.day.calendar': 'календарных',
  'deadline.day.business': 'рабочих',
  'deadline.basis.after': '{amount} {unit} ({kind}) после {date}',
  'deadline.basis.before': '{amount} {unit} ({kind}) до {date}',
  'deadline.rolled': 'Перенесено с {date}: выходной или праздник',
  'deadline.warn.holidays':
      'Праздники этого года не загружены. Проверьте у суда.',
  'deadline.warn.statute': 'Правило не проверено. Проверьте в статуте.',
  'deadline.warn.court': 'Правило не проверено. Проверьте у суда.',
  'deadline.disclaimer':
      'Не юридическая консультация. Проверьте у суда или в статуте.',
  'deadline.add': 'В планировщик',
  'deadline.export': 'Экспорт .ics',
  'deadline.added': 'Добавлено в планировщик',
  'deadline.task.title': 'Срок: {rule}',
  'deadline.case.hint': 'Расчёт по дате события',
};

const deadlineEn = <String, String>{
  'deadline.title': 'Deadlines',
  'deadline.kind.court': 'Court',
  'deadline.kind.statute': 'Statute',
  'deadline.state': 'State',
  'deadline.federal': 'Federal',
  'deadline.rule': 'Rule',
  'deadline.noRules': 'No rules',
  'deadline.date': 'Event date',
  'deadline.result': 'Result',
  'deadline.due': 'Last day',
  'deadline.unit.day': 'days',
  'deadline.unit.month': 'mo.',
  'deadline.unit.year': 'yr.',
  'deadline.day.calendar': 'calendar',
  'deadline.day.business': 'business',
  'deadline.basis.after': '{amount} {unit} ({kind}) after {date}',
  'deadline.basis.before': '{amount} {unit} ({kind}) before {date}',
  'deadline.rolled': 'Moved from {date}: weekend or holiday',
  'deadline.warn.holidays':
      "This year's holidays are not loaded. Check with the court.",
  'deadline.warn.statute': 'Rule not verified. Check the statute.',
  'deadline.warn.court': 'Rule not verified. Check with the court.',
  'deadline.disclaimer':
      'Not legal advice. Check with the court or the statute.',
  'deadline.add': 'To planner',
  'deadline.export': 'Export .ics',
  'deadline.added': 'Added to planner',
  'deadline.task.title': 'Deadline: {rule}',
  'deadline.case.hint': 'Count from the event date',
};
