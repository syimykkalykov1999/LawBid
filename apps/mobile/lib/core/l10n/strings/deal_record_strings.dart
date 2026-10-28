// ignore_for_file: lines_longer_than_80_chars
// Deal record 2026-10-27 (docs/architecture/DEAL_RECORD_PLAN_2026-10-27.md):
// the deal record screen and card, the rich payment terms of a bid, the
// notification rows. Compiled-in en/ru; other languages come from the xlsx
// workbook (the same keys, admin-editable: the three consent lines and the
// PDF texts are `deal_record.*`).

const dealRecordRu = <String, String>{
  'deal.title': 'Запись о сделке',
  'deal.subtitle':
      'Не договор. Запись о том, как вы договорились в приложении.',
  'deal.row.case': 'Дело',
  'deal.row.client': 'Клиент',
  'deal.row.attorney': 'Адвокат',
  'deal.row.terms': 'Условия оплаты',
  'deal.row.accepted': 'Принято',
  'deal.history': 'История предложений',
  'deal.history.count': 'Сообщений: {n}',
  'deal.offer.offer': 'Предложение',
  'deal.offer.counter': 'Контрпредложение',
  'deal_record.consent.not_contract': 'Это не договор',
  'deal_record.consent.platform':
      'Платформа не сторона и не участвует в оплате',
  'deal_record.consent.accurate':
      'Подписью я подтверждаю, что эта запись переговоров верна',
  'deal.confirm': 'Подтвердить',
  'deal.decline': 'Отказаться',
  'deal.decline.message':
      'Пока ничего не принято. Дело остаётся открытым, предложение — активным.',
  'deal.nameAsk': 'Введите имя и фамилию, как они должны стоять под подписью.',
  'deal.status.preparing': 'Готовим документ…',
  'deal.status.yourTurn': 'Ждёт вашей подписи',
  'deal.status.otherTurn': 'Ждёт другую сторону',
  'deal.status.sealed': 'Запечатано',
  'deal.status.declined': 'Отклонено',
  'deal.status.failed': 'Не удалось подготовить документ',
  'deal.print': 'Печать',
  'deal.agreement': 'Договор адвоката',
  'deal.agreement.pick': 'Выберите PDF из файлов дела',
  'deal.terms.title': 'Условия оплаты (подробно)',
  'deal.terms.notes': 'Заметки',
  'deal.terms.type.flat': 'Фиксированная сумма',
  'deal.terms.type.hourly': 'Почасово',
  'deal.terms.type.contingency_pct': 'Процент от выигрыша',
  'deal.terms.type.retainer_plus_installments': 'Аванс + платежи',
  'deal.terms.type.mixed': 'Смешанно',
  'deal.terms.type.to_be_clarified': 'Уточним позже',
  'deal.terms.retainer': r'Аванс, $',
  'deal.terms.installment': r'Каждый платёж, $',
  'deal.terms.count': 'Число платежей',
  'deal.terms.period.weekly': 'еженедельно',
  'deal.terms.period.monthly': 'ежемесячно',
  'deal.terms.period.quarterly': 'ежеквартально',
  'error.api.DEAL_RECORD_PENDING':
      'По этому делу уже есть запись о сделке, ждущая подписей.',
  'error.api.DEAL_RECORD_INVALID_STATE':
      'Запись о сделке изменилась. Обновите, чтобы увидеть её состояние.',
  'error.api.PAYMENT_TERMS_INVALID':
      'Проверьте условия оплаты: не хватает суммы или она неверна.',
  'notif.list.case_workspace_activity.deal_record_sign':
      '{name} принял(а) предложение — подпишите запись о сделке',
  'notif.list.case_workspace_activity.deal_record_sealed':
      '{name} подписал(а) запись о сделке',
  'notif.list.case_workspace_activity.deal_record_declined':
      '{name} отклонил(а) запись о сделке',
  'deal_record.pdf.title': 'Deal record — LawBid',
  'deal_record.pdf.not_contract':
      'This is not a contract. The attorney and the client conclude their legal-services agreement separately. This document only records how they agreed inside the LawBid app.',
  'deal_record.pdf.footer':
      'LawBid is a listing board: clients post cases, attorneys make offers. LawBid is not a party to your agreement, is not an intermediary, does not handle or take any part of any payment or fee, and is not responsible for the result. This document only records how you agreed in the app, on the dates shown.',
};

const dealRecordEn = <String, String>{
  'deal.title': 'Deal record',
  'deal.subtitle': 'Not a contract. A record of how you agreed in the app.',
  'deal.row.case': 'Case',
  'deal.row.client': 'Client',
  'deal.row.attorney': 'Attorney',
  'deal.row.terms': 'Payment terms',
  'deal.row.accepted': 'Accepted',
  'deal.history': 'Offer history',
  'deal.history.count': 'Messages: {n}',
  'deal.offer.offer': 'Offer',
  'deal.offer.counter': 'Counter-offer',
  'deal_record.consent.not_contract': 'This is not a contract',
  'deal_record.consent.platform':
      'The platform is not a party and does not take part in payment',
  'deal_record.consent.accurate':
      'By signing I confirm this record of the negotiation is accurate',
  'deal.confirm': 'Confirm',
  'deal.decline': 'Decline',
  'deal.decline.message':
      'Nothing has been accepted yet. The case stays open and the offer stays active.',
  'deal.nameAsk':
      'Enter your first and last name as they should appear under the signature.',
  'deal.status.preparing': 'Preparing the document…',
  'deal.status.yourTurn': 'Awaiting your signature',
  'deal.status.otherTurn': 'Awaiting the other party',
  'deal.status.sealed': 'Sealed',
  'deal.status.declined': 'Declined',
  'deal.status.failed': 'The document could not be prepared',
  'deal.print': 'Print',
  'deal.agreement': "Attorney's agreement",
  'deal.agreement.pick': 'Choose a PDF from the case files',
  'deal.terms.title': 'Payment terms (details)',
  'deal.terms.notes': 'Notes',
  'deal.terms.type.flat': 'Flat fee',
  'deal.terms.type.hourly': 'Hourly',
  'deal.terms.type.contingency_pct': 'Percent of recovery',
  'deal.terms.type.retainer_plus_installments': 'Retainer + installments',
  'deal.terms.type.mixed': 'Mixed',
  'deal.terms.type.to_be_clarified': 'To be clarified',
  'deal.terms.retainer': r'Retainer, $',
  'deal.terms.installment': r'Each payment, $',
  'deal.terms.count': 'Number of payments',
  'deal.terms.period.weekly': 'weekly',
  'deal.terms.period.monthly': 'monthly',
  'deal.terms.period.quarterly': 'quarterly',
  'error.api.DEAL_RECORD_PENDING':
      'This case already has a deal record waiting for signatures.',
  'error.api.DEAL_RECORD_INVALID_STATE':
      'The deal record has changed. Refresh to see its state.',
  'error.api.PAYMENT_TERMS_INVALID':
      'Check the payment terms: an amount is missing or wrong.',
  'notif.list.case_workspace_activity.deal_record_sign':
      '{name} accepted the offer — sign the deal record',
  'notif.list.case_workspace_activity.deal_record_sealed':
      '{name} signed the deal record',
  'notif.list.case_workspace_activity.deal_record_declined':
      '{name} declined the deal record',
  'deal_record.pdf.title': 'Deal record — LawBid',
  'deal_record.pdf.not_contract':
      'This is not a contract. The attorney and the client conclude their legal-services agreement separately. This document only records how they agreed inside the LawBid app.',
  'deal_record.pdf.footer':
      'LawBid is a listing board: clients post cases, attorneys make offers. LawBid is not a party to your agreement, is not an intermediary, does not handle or take any part of any payment or fee, and is not responsible for the result. This document only records how you agreed in the app, on the dates shown.',
};
