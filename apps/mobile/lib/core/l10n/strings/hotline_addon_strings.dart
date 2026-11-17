// ignore_for_file: lines_longer_than_80_chars
// Owner row 87 (16.11, hotline plan PR 8): the «Горячая линия» add-on row
// of the subscription card and its pay sheet.
// Other languages: apps/api/prisma/seed/translations.

const hotlineAddonRu = <String, String>{
  'plans.hotline.title': 'Горячая линия',
  'plans.hotline.each': '+{price} в месяц',
  'plans.hotline.until': 'Работает до {date}',
  'plans.hotline.afterPayment': 'Можно подключить после первой оплаты подписки',
  'plans.hotline.pending': 'Подтверждаем оплату',
  'plans.hotline.done': 'Горячая линия подключена',
  'plans.hotline.off': 'Горячая линия выключится {date}',
};

const hotlineAddonEn = <String, String>{
  'plans.hotline.title': 'Call hotline',
  'plans.hotline.each': '+{price} a month',
  'plans.hotline.until': 'On until {date}',
  'plans.hotline.afterPayment':
      'Available after the first subscription payment',
  'plans.hotline.pending': 'Confirming the payment',
  'plans.hotline.done': 'Call hotline added',
  'plans.hotline.off': 'Call hotline turns off on {date}',
};
