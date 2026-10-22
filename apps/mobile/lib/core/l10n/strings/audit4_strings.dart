// ignore_for_file: lines_longer_than_80_chars
// Owner 2026-10-22 (product audit #4): «Attorney Advertising» label, one
// «Сохранённое» and one «Платежи» for both roles, optional password after
// the code, upload queue states. Every other language:
// apps/api/prisma/seed/translations_seed.xlsx (scripts/i18n-add.mjs).

const audit4Ru = <String, String>{
  'legal.attorneyAdvertising': 'Реклама адвоката',
  'privacy.section.data': 'Данные',
  'privacy.analytics': 'Статистика использования',
  'privacy.analytics.hint':
      'Анонимные счётчики открытых экранов помогают улучшать LawBid. Пока вы это не включите, ничего не отправляется.',
};

const audit4En = <String, String>{
  'legal.attorneyAdvertising': 'Attorney Advertising',
  'privacy.section.data': 'Data',
  'privacy.analytics': 'Usage statistics',
  'privacy.analytics.hint':
      'Anonymous counts of which screens are opened help us improve LawBid. Nothing is sent unless you turn this on.',
};
