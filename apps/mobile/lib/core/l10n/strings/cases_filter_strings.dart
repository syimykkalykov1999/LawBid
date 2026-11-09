// ignore_for_file: lines_longer_than_80_chars
// Owner 2026-11-09: the filter of the cases screen («Дела → Активные» and
// the attorney's «Active» work) — the icon left of the search and its
// sheet. Only the texts that did not exist yet; «Новые», «В работе»,
// «Открыт», «Дата», «Все», «Сбросить», «Сначала новые / старые» and
// «Фильтры» reuse their existing keys. Compiled-in strings merged into
// StaticTranslatorRu/En (every other language: the translations seed).

const casesFilterRu = <String, String>{
  'mine.listFilter.newHint': 'Адвокаты ещё не ответили',
  'mine.listFilter.stages': 'По этапам',
  'mine.listFilter.awaiting': 'Ждёт меня',
  'mine.listFilter.awaitingHint': 'Выбрать адвоката или подтвердить завершение',
  'mine.listFilter.sort.stage': 'По этапам: сначала дальше всего',
};

const casesFilterEn = <String, String>{
  'mine.listFilter.newHint': 'No attorney replies yet',
  'mine.listFilter.stages': 'By stage',
  'mine.listFilter.awaiting': 'Waiting for me',
  'mine.listFilter.awaitingHint': 'Choose an attorney or confirm completion',
  'mine.listFilter.sort.stage': 'By stage: most advanced first',
};
