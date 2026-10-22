// ignore_for_file: lines_longer_than_80_chars
// Owner 2026-10-22 (audit #3): every purchase on the iPhone opens our card
// page in the browser; an unpaid Boost can be paid, started over or
// cancelled. Other languages: apps/api/prisma/seed/translations_seed.xlsx.

const webCheckoutRu = <String, String>{
  'payments.inBrowser':
      'Оплата открылась в браузере. После оплаты вернитесь в приложение.',
  'payments.openFailed': 'Не удалось открыть страницу оплаты.',
  'payments.opensInBrowser': 'Оплата откроется в браузере',
  'promote.pending.title': 'Продвижение не оплачено',
  'promote.pending.message':
      'Оплата {price} не завершена. Оплатите, начните заново или отмените.',
  'promote.pending.restart': 'Начать заново',
  'promote.pending.cancel': 'Отменить',
  'promote.pending.cancelTitle': 'Отменить продвижение?',
  'promote.pending.cancelConfirm': 'Да, отменить',
  'promote.pending.cancelMessage':
      'Оплата будет отменена, деньги не спишутся. Публикация останется как была.',
  'promote.pending.canceled': 'Продвижение отменено',
  'promote.pending.alreadyPaid': 'Оплата уже прошла — продвижение запущено',
};

const webCheckoutEn = <String, String>{
  'payments.inBrowser':
      'The payment opened in your browser. Come back to the app when you are done.',
  'payments.openFailed': 'The payment page could not be opened.',
  'payments.opensInBrowser': 'Payment opens in your browser',
  'promote.pending.title': 'Boost not paid',
  'promote.pending.message':
      'The {price} payment was not finished. Pay it, start over or cancel.',
  'promote.pending.restart': 'Start over',
  'promote.pending.cancel': 'Cancel',
  'promote.pending.cancelTitle': 'Cancel this Boost?',
  'promote.pending.cancelConfirm': 'Yes, cancel',
  'promote.pending.cancelMessage':
      'The payment is cancelled and nothing is charged. Your post stays as it was.',
  'promote.pending.canceled': 'Boost cancelled',
  'promote.pending.alreadyPaid': 'It was already paid — your Boost is running',
};
