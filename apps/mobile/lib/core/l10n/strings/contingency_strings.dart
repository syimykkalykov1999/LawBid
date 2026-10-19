// Owner 2026-10-17: percent (contingency) budgets and bids.

const contingencyRu = <String, String>{
  'cases.budget.percent': 'Проценты',
  'cases.budget.percentForbidden': 'Для этой темы процент запрещён',
  'cases.field.budgetPercent': 'Процент от компенсации',
  'cases.field.budgetPercentError': 'Введите процент от 0,01 до {max}',
  'cases.create.budget.percentHint':
      'Адвокат получит этот процент, только если выиграет для вас деньги. '
          'Это ваш договор с адвокатом.',
  'cases.fee.percent': 'Процент',
  'cases.fee.percentShort': 'Процент',
  'cases.fee.percentOf': '{percent}% от компенсации',
  'cases.bidForm.percent': 'Ваш процент от компенсации',
  'cases.bidForm.percentHint':
      'Клиент платит, только если вы выиграете для него деньги.',
  'cases.bidForm.percentError': 'Введите процент от 0,01 до {max}',
  'cases.counter.percent': 'Новый процент',
  'error.api.CONTINGENCY_NOT_ALLOWED':
      'Для этого вида дела работа за процент не допускается.',
  // OQ-054 (mockup): the client's activity on a card.
  'cases.activity.online': 'Клиент в сети',
  'cases.activity.today': 'Клиент был сегодня',
  'cases.activity.lastSeen.one': 'Клиент был {n} день назад',
  'cases.activity.lastSeen.few': 'Клиент был {n} дня назад',
  'cases.activity.lastSeen.many': 'Клиент был {n} дней назад',
  'cases.activity.lastSeen.other': 'Клиент был {n} дня назад',
  'cases.activity.responds': 'Отвечает в течение дня',
};

const contingencyEn = <String, String>{
  'cases.budget.percentForbidden': 'A percent is not allowed for this topic',
  'cases.budget.percent': 'Percent',
  'cases.field.budgetPercent': 'Percent of the recovery',
  'cases.field.budgetPercentError': 'Enter a percent from 0.01 to {max}',
  'cases.create.budget.percentHint':
      'The attorney gets this percent only if they win money for you. '
          'It is your agreement with the attorney.',
  'cases.fee.percent': 'Percent',
  'cases.fee.percentShort': 'Percent',
  'cases.fee.percentOf': '{percent}% of recovery',
  'cases.bidForm.percent': 'Your percent of the recovery',
  'cases.bidForm.percentHint':
      'The client pays only if you win money for them.',
  'cases.bidForm.percentError': 'Enter a percent from 0.01 to {max}',
  'cases.counter.percent': 'New percent',
  'error.api.CONTINGENCY_NOT_ALLOWED':
      'A percent fee is not allowed for this kind of case.',
  'cases.activity.online': 'Client online',
  'cases.activity.today': 'Client active today',
  'cases.activity.lastSeen.one': 'Client active {n} day ago',
  'cases.activity.lastSeen.other': 'Client active {n} days ago',
  'cases.activity.responds': 'Usually replies within a day',
};
