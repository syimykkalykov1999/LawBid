// ignore_for_file: lines_longer_than_80_chars
// Owner 2026-10-22 (systems checklist, mobile items 1–9): guest browsing,
// passkeys, reduce motion, link previews, the CCPA switch, the in-app review
// prompt. Every other language: apps/api/prisma/seed/translations_seed.xlsx
// (scripts/i18n-add.mjs).

const checklistRu = <String, String>{
  // Item 9: CCPA «Do Not Sell or Share» + the accessibility statement.
  'privacy.doNotSell': 'Не продавать и не передавать мои данные',
  'privacy.doNotSell.hint':
      'Закон Калифорнии (CCPA). LawBid не продаёт персональные данные; этот переключатель также запрещает передачу данных для рекламы.',
  'legal.doc.accessibility': 'Заявление о доступности',
  // Item 5: spoken names of icon-only buttons (VoiceOver / TalkBack).
  'a11y.mute': 'Выключить звук',
  'a11y.unmute': 'Включить звук',
  'a11y.less': 'Меньше',
  'a11y.more': 'Больше',
  'a11y.gridView': 'Сеткой',
  'a11y.listView': 'Списком',
  'a11y.rateStars': 'Оценка {count}',
};

const checklistEn = <String, String>{
  'privacy.doNotSell': 'Do not sell or share my personal information',
  'privacy.doNotSell.hint':
      'California law (CCPA). LawBid does not sell personal data; this switch also opts you out of sharing for advertising.',
  'legal.doc.accessibility': 'Accessibility statement',
  'a11y.mute': 'Mute',
  'a11y.unmute': 'Unmute',
  'a11y.less': 'Less',
  'a11y.more': 'More',
  'a11y.gridView': 'Grid view',
  'a11y.listView': 'List view',
  'a11y.rateStars': 'Rate {count}',
};
