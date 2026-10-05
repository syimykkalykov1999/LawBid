// ignore_for_file: lines_longer_than_80_chars
// Owner 2026-10-05: a client offers their case to a chosen attorney
// ("Предложить дело") — compiled-in strings merged into
// StaticTranslatorRu/En.

const inviteRu = <String, String>{
  'invite.offer.button': 'Предложить дело',
  'invite.offer.title': 'Предложить дело: {name}',
  'invite.offer.body':
      'Адвокат увидит дело и ответит бидом или откажется. Ваше имя и контакты скрыты, пока вы не примете бид.',
  'invite.offer.pickCase': 'Какое дело?',
  'invite.offer.noCases':
      'У вас нет открытых дел. Создайте дело, а потом предложите его адвокату.',
  'invite.offer.createCase': 'Создать дело',
  'invite.offer.budget': r'Ваш бюджет, $',
  'invite.offer.budgetHint': 'Необязательно',
  'invite.offer.message': 'Сообщение адвокату',
  'invite.offer.messageHint': 'Необязательно. Без телефонов и email.',
  'invite.offer.send': 'Отправить',
  'invite.offer.sent': 'Отправлено. Мы сообщим, когда адвокат ответит.',
  'invite.offer.alreadyBid': 'Этот адвокат уже прислал бид на это дело.',
  'invite.mismatch.state': 'У адвоката нет лицензии в штате этого дела.',
  'invite.mismatch.practice': 'Дело не в практиках этого адвоката.',
  'invites.title': 'Приглашения от клиентов',
  'invites.section': 'Приглашения',
  'invites.empty': 'Пока нет приглашений',
  'invites.empty.body': 'Когда клиент предложит вам дело, оно появится здесь.',
  'invites.budget': 'Бюджет клиента: {amount}',
  'invites.noBudget': 'Бюджет обсуждается',
  'invites.expires': 'Ответить до {date}',
  'invites.clientNote': 'Сообщение клиента',
  'invites.answer': 'Ответить бидом',
  'invites.open': 'Открыть дело',
  'invites.decline': 'Отказаться',
  'invites.decline.title': 'Отказаться от дела?',
  'invites.decline.reason': 'Причина (необязательно, клиент её увидит)',
  'invites.decline.confirm': 'Отказаться',
  'invites.declined': 'Вы отказались. Клиент получил уведомление.',
  'caseInvites.title': 'Приглашённые адвокаты',
  'caseInvites.cancel': 'Отменить',
  'caseInvites.cancel.confirm': 'Отменить приглашение?',
  'caseInvites.cancelled': 'Приглашение отменено',
  'caseInvites.reason': 'Причина: {reason}',
  'caseInvites.status.pending': 'Ждёт ответа',
  'caseInvites.status.accepted': 'Прислал бид',
  'caseInvites.status.declined': 'Отказался',
  'caseInvites.status.cancelled': 'Отменено',
  'caseInvites.status.expired': 'Истекло',
  'caseInvites.status.closed': 'Дело закрыто',
  'notif.bids.case_invite_received.title': 'Клиент предлагает вам дело',
  'notif.bids.case_invite_received.body':
      'Откройте его и ответьте бидом или откажитесь.',
  'notif.bids.case_invite_declined.title': 'Приглашение отклонено',
  'notif.bids.case_invite_declined.body':
      'Адвокат отказался от дела. Пригласите другого.',
  'error.api.INVITE_NOT_FOUND': 'Приглашение не найдено.',
  'error.api.INVITE_INVALID_STATE':
      'Приглашение уже отвечено, отменено или истекло.',
  'error.api.INVITE_ALREADY_PENDING':
      'Вы уже пригласили этого адвоката к этому делу.',
  'error.api.INVITE_ATTORNEY_UNAVAILABLE':
      'Этот адвокат сейчас не может взять дело.',
  'error.api.INVITE_LIMIT_REACHED':
      'Слишком много приглашений. Попробуйте позже.',
};

const inviteEn = <String, String>{
  'invite.offer.button': 'Offer a case',
  'invite.offer.title': 'Offer a case to {name}',
  'invite.offer.body':
      'The attorney sees the case and answers with a bid or declines. Your name and contacts stay hidden until you accept a bid.',
  'invite.offer.pickCase': 'Which case?',
  'invite.offer.noCases':
      'You have no open cases. Create one, then offer it to the attorney.',
  'invite.offer.createCase': 'Create a case',
  'invite.offer.budget': r'Your budget, $',
  'invite.offer.budgetHint': 'Optional',
  'invite.offer.message': 'Note to the attorney',
  'invite.offer.messageHint': 'Optional. No phone numbers or emails.',
  'invite.offer.send': 'Send',
  'invite.offer.sent': "Sent. We'll let you know when the attorney answers.",
  'invite.offer.alreadyBid': 'This attorney already sent a bid on this case.',
  'invite.mismatch.state':
      "This attorney has no licence in the case's state.",
  'invite.mismatch.practice':
      "This case is outside the attorney's practice areas.",
  'invites.title': 'Invitations from clients',
  'invites.section': 'Invitations',
  'invites.empty': 'No invitations yet',
  'invites.empty.body': 'When a client offers you a case, it appears here.',
  'invites.budget': "Client's budget: {amount}",
  'invites.noBudget': 'Budget to discuss',
  'invites.expires': 'Answer by {date}',
  'invites.clientNote': "Client's note",
  'invites.answer': 'Answer with a bid',
  'invites.open': 'Open case',
  'invites.decline': 'Decline',
  'invites.decline.title': 'Decline the case?',
  'invites.decline.reason': 'Reason (optional, the client sees it)',
  'invites.decline.confirm': 'Decline',
  'invites.declined': 'Declined. The client was told.',
  'caseInvites.title': 'Invited attorneys',
  'caseInvites.cancel': 'Cancel',
  'caseInvites.cancel.confirm': 'Cancel this invite?',
  'caseInvites.cancelled': 'Invite cancelled',
  'caseInvites.reason': 'Reason: {reason}',
  'caseInvites.status.pending': 'Waiting for an answer',
  'caseInvites.status.accepted': 'Sent a bid',
  'caseInvites.status.declined': 'Declined',
  'caseInvites.status.cancelled': 'Cancelled',
  'caseInvites.status.expired': 'Expired',
  'caseInvites.status.closed': 'Case closed',
  'notif.bids.case_invite_received.title': 'A client offers you a case',
  'notif.bids.case_invite_received.body':
      'Open it and answer with a bid or decline.',
  'notif.bids.case_invite_declined.title': 'Invitation declined',
  'notif.bids.case_invite_declined.body':
      'The attorney declined your case. Invite another one.',
  'error.api.INVITE_NOT_FOUND': 'Invite not found.',
  'error.api.INVITE_INVALID_STATE':
      'This invite was already answered, cancelled or has expired.',
  'error.api.INVITE_ALREADY_PENDING':
      'You already invited this attorney to this case.',
  'error.api.INVITE_ATTORNEY_UNAVAILABLE':
      "This attorney can't take cases right now.",
  'error.api.INVITE_LIMIT_REACHED': 'Too many invites. Try again later.',
};
