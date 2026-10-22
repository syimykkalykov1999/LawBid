// ignore_for_file: lines_longer_than_80_chars
// Owner 2026-10-22: «Роли помощников» (the 10 duties, at most N per
// assistant) and buying assistant seats — charged now for the rest of the
// period, then monthly; a removed seat stays until the period end. Other
// languages: apps/api/prisma/seed/translations_seed.xlsx.

const seatRolesRu = <String, String>{
  'team.roles.title': 'Роли помощников',
  'team.roles.intro':
      'У одного помощника — не больше {max} ролей. Остальные роли дайте другому помощнику: так никто не получает весь аккаунт.',
  'team.roles.group.talk': 'Звонки, чаты и файлы',
  'team.roles.group.work': 'Дела и подготовка',
  'team.roles.group.name': 'От вашего имени',
  'team.roles.pick': 'Кому даём роли',
  'team.roles.tooMany':
      'У одного помощника — не больше {max} ролей. Добавьте ещё помощника.',
  'team.roles.noAssistant': 'Добавьте помощника — и включайте ему нужные роли.',
  'team.roles.buyHint':
      'Свободных мест нет. Купите место — и добавьте помощника.',
  'seats.buy.title': 'Места для помощников',
  'seats.buy.count': 'Дополнительных мест',
  'seats.buy.now': 'К оплате сейчас: {price} (до {date})',
  'seats.buy.nowNoDate': 'К оплате сейчас: {price}',
  'seats.buy.then': 'Затем +{price} в месяц',
  'seats.buy.pay': 'Оплатить {price}',
  'seats.buy.done': 'Места добавлены',
  'seats.buy.pending': 'Оплата подтверждена — места появятся через минуту',
  'seats.buy.failed': 'Карта отклонена. Деньги не списаны.',
  'seats.buy.trial': 'Места можно купить после первой оплаты подписки.',
  'seats.buy.limit': 'У вас уже максимум мест для вашего плана.',
  'seats.remove.scheduled': 'Место останется до {date}, дальше без списаний.',
  'error.api.SEATS_TRIAL_NOT_ALLOWED':
      'Места можно купить после первой оплаты подписки.',
  'error.api.SEATS_NOT_PAID_YET':
      'Места можно купить после первой оплаты подписки.',
  'error.api.SEATS_PREVIEW_STALE': 'Цена изменилась — проверьте ещё раз.',
  'error.api.ASSISTANT_TOO_MANY_DUTIES':
      'У одного помощника слишком много ролей. Добавьте ещё помощника.',
};

const seatRolesEn = <String, String>{
  'team.roles.title': 'Assistant roles',
  'team.roles.intro':
      'One assistant holds at most {max} roles. Give the other roles to another assistant, so nobody gets the whole account.',
  'team.roles.group.talk': 'Calls, chats and files',
  'team.roles.group.work': 'Cases and preparation',
  'team.roles.group.name': 'In your name',
  'team.roles.pick': 'Who gets the roles',
  'team.roles.tooMany':
      'One assistant holds at most {max} roles. Add another assistant.',
  'team.roles.noAssistant':
      'Add an assistant, then switch on the roles they need.',
  'team.roles.buyHint': 'No free seats. Buy a seat, then add an assistant.',
  'seats.buy.title': 'Assistant seats',
  'seats.buy.count': 'Extra seats',
  'seats.buy.now': 'Due now: {price} (until {date})',
  'seats.buy.nowNoDate': 'Due now: {price}',
  'seats.buy.then': 'Then +{price} a month',
  'seats.buy.pay': 'Pay {price}',
  'seats.buy.done': 'Seats added',
  'seats.buy.pending': 'Payment confirmed — the seats appear in a minute',
  'seats.buy.failed': 'The card was declined. Nothing was charged.',
  'seats.buy.trial':
      'Seats can be bought after the first payment of your subscription.',
  'seats.buy.limit': 'You already have the most seats your plan allows.',
  'seats.remove.scheduled':
      'The seat stays until {date}; no charge after that.',
  'error.api.SEATS_TRIAL_NOT_ALLOWED':
      'Seats can be bought after the first payment of your subscription.',
  'error.api.SEATS_NOT_PAID_YET':
      'Seats can be bought after the first payment of your subscription.',
  'error.api.SEATS_PREVIEW_STALE': 'The price changed — check it again.',
  'error.api.ASSISTANT_TOO_MANY_DUTIES':
      'This assistant has too many roles. Add another assistant.',
};
