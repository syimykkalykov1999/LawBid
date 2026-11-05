// ignore_for_file: lines_longer_than_80_chars
// R-392 (owner 2026-11-04): closing a case in work takes both sides —
// «Закрыть кейс» / «Подтвердить закрытие» / «Не закрывать», the chat lines
// and the bell rows. Compiled-in en/ru; other languages come from the
// translations seed (apps/api/prisma/seed/translations).

const caseCloseRu = <String, String>{
  'cases.close.request': 'Закрыть кейс',
  'cases.close.requestTitle': 'Закрыть кейс?',
  'cases.close.requestMessage':
      'Другая сторона получит запрос и подтвердит закрытие. Если она не ответит вовремя, кейс закроется автоматически.',
  'cases.close.sent': 'Запрос на закрытие отправлен',
  'cases.close.waiting':
      'Вы предложили закрыть кейс. Ждём подтверждения другой стороны. Без ответа кейс закроется автоматически {date}.',
  'cases.close.askedByClient':
      'Клиент предлагает закрыть кейс. Подтвердите или оставьте его в работе. Без ответа кейс закроется автоматически {date}.',
  'cases.close.askedByAttorney':
      'Адвокат предлагает закрыть кейс. Подтвердите или оставьте его в работе. Без ответа кейс закроется автоматически {date}.',
  'cases.close.confirm': 'Подтвердить закрытие',
  'cases.close.confirmTitle': 'Закрыть кейс для обеих сторон?',
  'cases.close.confirmMessage':
      'Кейс будет закрыт. Вы оба получите уведомление.',
  'cases.close.decline': 'Не закрывать',
  'cases.close.declined': 'Кейс остаётся в работе',
  'chat.system.close_requested_client': 'Клиент предложил закрыть кейс',
  'chat.system.close_requested_attorney': 'Адвокат предложил закрыть кейс',
  'chat.system.close_declined_client':
      'Клиент решил не закрывать кейс. Он остаётся в работе',
  'chat.system.close_declined_attorney':
      'Адвокат решил не закрывать кейс. Он остаётся в работе',
  'chat.system.deal_record_sealed':
      'Запись о сделке подписана обеими сторонами. PDF — в кейсе',
  'notif.list.close_requested_client':
      'Клиент предлагает закрыть кейс — подтвердите или оставьте в работе',
  'notif.list.close_requested_attorney':
      'Адвокат предлагает закрыть кейс — подтвердите или оставьте в работе',
  'notif.list.case_workspace_activity.close_declined':
      '{name} не стал(а) закрывать кейс — он остаётся в работе',
  'notif.workspace.close_requested_client':
      'Клиент предлагает закрыть кейс. Подтвердите или оставьте его в работе.',
  'notif.workspace.close_requested_attorney':
      'Адвокат предлагает закрыть кейс. Подтвердите или оставьте его в работе.',
  'notif.workspace.close_declined':
      'Другая сторона не стала закрывать кейс. Он остаётся в работе.',
  'history.event.completion_declined': 'Оставлен в работе',
};

const caseCloseEn = <String, String>{
  'cases.close.request': 'Close the case',
  'cases.close.requestTitle': 'Close the case?',
  'cases.close.requestMessage':
      "The other side gets a request to confirm. If they don't answer in time, the case closes automatically.",
  'cases.close.sent': 'Close request sent',
  'cases.close.waiting':
      'You asked to close the case. Waiting for the other side to confirm. Without an answer it closes automatically on {date}.',
  'cases.close.askedByClient':
      'The client asks to close the case. Confirm or keep it in work. Without an answer it closes automatically on {date}.',
  'cases.close.askedByAttorney':
      'The attorney asks to close the case. Confirm or keep it in work. Without an answer it closes automatically on {date}.',
  'cases.close.confirm': 'Confirm closing',
  'cases.close.confirmTitle': 'Close the case for both sides?',
  'cases.close.confirmMessage':
      'The case will be closed. Both of you get a notice.',
  'cases.close.decline': 'Keep it open',
  'cases.close.declined': 'The case stays in work',
  'chat.system.close_requested_client': 'The client asked to close the case',
  'chat.system.close_requested_attorney':
      'The attorney asked to close the case',
  'chat.system.close_declined_client':
      'The client kept the case open. It stays in work',
  'chat.system.close_declined_attorney':
      'The attorney kept the case open. It stays in work',
  'chat.system.deal_record_sealed':
      'Deal record signed by both sides. The PDF is in the case',
  'notif.list.close_requested_client':
      'The client asks to close the case — confirm or keep it open',
  'notif.list.close_requested_attorney':
      'The attorney asks to close the case — confirm or keep it open',
  'notif.list.case_workspace_activity.close_declined':
      '{name} kept the case open — it stays in work',
  'notif.workspace.close_requested_client':
      'The client asks to close the case. Confirm or keep it open.',
  'notif.workspace.close_requested_attorney':
      'The attorney asks to close the case. Confirm or keep it open.',
  'notif.workspace.close_declined':
      'The other side kept the case open. It stays in work.',
  'history.event.completion_declined': 'Kept in work',
};
