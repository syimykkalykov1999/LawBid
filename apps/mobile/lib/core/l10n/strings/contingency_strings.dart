// Owner 2026-10-17: percent (contingency) budgets and bids.

const contingencyRu = <String, String>{
  'cases.budget.percent': 'Проценты',
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
};

const contingencyEn = <String, String>{
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
};
