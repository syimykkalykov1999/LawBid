// ignore_for_file: lines_longer_than_80_chars
// Owner 2026-10-20: case tools — the conflict-of-interest warning, chat
// lines and notifications for invoices and signatures, the timer chip in
// "Mine". Compiled-in; other languages come from the xlsx workbook.

const caseToolsRu = <String, String>{
  'conflict.title': 'Возможен конфликт интересов',
  'conflict.hint':
      'Проверьте перед ставкой. Ставку можно отправить, проверка записана.',
  'conflict.former': 'Ваш бывший клиент назван в кейсе «{case}» ({by})',
  'conflict.opposing':
      'Клиент этого кейса назван в вашем кейсе «{case}» ({by})',
  'conflict.by.name': 'имя',
  'conflict.by.phone': 'телефон',
  'conflict.by.email': 'почта',
  'chat.system.invoice_issued': 'Выставлен счёт на {amount}',
  'chat.system.sign_requested': 'Документ ждёт подписи',
  'chat.system.sign_completed': 'Документ подписан обеими сторонами',
  'chat.system.sign_declined': 'Подпись отклонена',
  'notif.workspace.invoice': 'Выставлен счёт по кейсу.',
  'notif.workspace.sign_request': 'Документ ждёт вашей подписи.',
  'notif.workspace.sign_done': 'Документ подписан.',
  'notif.workspace.sign_declined': 'Подпись документа отклонена.',
  'notif.list.case_workspace_activity.invoice':
      '{name} выставил(а) счёт по кейсу',
  'notif.list.case_workspace_activity.sign_request':
      '{name} прислал(а) документ на подпись',
  'notif.list.case_workspace_activity.sign_done': '{name} подписал(а) документ',
  'notif.list.case_workspace_activity.sign_declined':
      '{name} отклонил(а) подпись документа',
  'timer.running': 'Идёт таймер',
  'timer.open': 'Открыть кейс',
};

const caseToolsEn = <String, String>{
  'conflict.title': 'Possible conflict of interest',
  'conflict.hint':
      'Check before you bid. You can still bid; the check is logged.',
  'conflict.former': 'Your former client is named in case “{case}” ({by})',
  'conflict.opposing':
      'This case’s client is named in your case “{case}” ({by})',
  'conflict.by.name': 'name',
  'conflict.by.phone': 'phone',
  'conflict.by.email': 'email',
  'chat.system.invoice_issued': 'Invoice issued for {amount}',
  'chat.system.sign_requested': 'A document awaits signatures',
  'chat.system.sign_completed': 'Document signed by both sides',
  'chat.system.sign_declined': 'Signature declined',
  'notif.workspace.invoice': 'An invoice was issued for the case.',
  'notif.workspace.sign_request': 'A document awaits your signature.',
  'notif.workspace.sign_done': 'The document is signed.',
  'notif.workspace.sign_declined': 'The document signature was declined.',
  'notif.list.case_workspace_activity.invoice':
      '{name} issued an invoice for the case',
  'notif.list.case_workspace_activity.sign_request':
      '{name} sent a document to sign',
  'notif.list.case_workspace_activity.sign_done': '{name} signed the document',
  'notif.list.case_workspace_activity.sign_declined':
      '{name} declined to sign the document',
  'timer.running': 'Timer running',
  'timer.open': 'Open case',
};
