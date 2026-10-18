// ignore_for_file: lines_longer_than_80_chars
// Owner 2026-10-17/18 (OQ-054): «Вам ещё нужен адвокат?», the pause, and the
// notification — merged into StaticTranslatorRu/En.

const staleCaseRu = <String, String>{
  'cases.stale.title': 'Вам ещё нужен адвокат?',
  'cases.stale.hint':
      'Если не ответить, кейс скроется из ленты адвокатов. Вернуть его можно одним касанием.',
  'cases.stale.yes': 'Да, нужен',
  'cases.stale.wait': 'Жду предложений получше',
  'cases.stale.no': 'Уже не нужен',
  'cases.stale.notUrgent': 'Сменить на «Не срочно»',
  'cases.stale.paused': 'Кейс скрыт из ленты',
  'cases.stale.resume': 'Вернуть',
  'cases.stale.pausedPill': 'На паузе',
  'cases.stale.answered': 'Спасибо, кейс остаётся в ленте',
  'cases.stale.resumed': 'Кейс снова в ленте',
  'cases.stale.notUrgentDone': 'Срочность изменена на «Не срочно»',
  'notif.list.case_still_needed.one':
      'Вам ещё нужен адвокат? Ждёт ответа {count} ваш кейс',
  'notif.list.case_still_needed.few':
      'Вам ещё нужен адвокат? Ждут ответа {count} ваших кейса',
  'notif.list.case_still_needed.many':
      'Вам ещё нужен адвокат? Ждут ответа {count} ваших кейсов',
  'notif.list.case_still_needed.other':
      'Вам ещё нужен адвокат? Ждут ответа {count} ваших кейса',
  'notif.cases.case_still_needed.title': 'Вам ещё нужен адвокат?',
  'notif.cases.case_still_needed.body':
      'Откройте кейс и ответьте в одно касание.',
};

const staleCaseEn = <String, String>{
  'cases.stale.title': 'Do you still need an attorney?',
  'cases.stale.hint':
      'If you do not answer, the case is hidden from the attorneys’ feed. You can bring it back with one tap.',
  'cases.stale.yes': 'Yes, I do',
  'cases.stale.wait': 'Waiting for better offers',
  'cases.stale.no': 'No longer needed',
  'cases.stale.notUrgent': 'Change to “Not urgent”',
  'cases.stale.paused': 'Case hidden from the feed',
  'cases.stale.resume': 'Bring back',
  'cases.stale.pausedPill': 'Paused',
  'cases.stale.answered': 'Thanks, your case stays in the feed',
  'cases.stale.resumed': 'Your case is back in the feed',
  'cases.stale.notUrgentDone': 'Urgency changed to “Not urgent”',
  'notif.list.case_still_needed.one':
      'Do you still need an attorney? {count} of your cases awaits an answer',
  'notif.list.case_still_needed.other':
      'Do you still need an attorney? {count} of your cases await an answer',
  'notif.cases.case_still_needed.title': 'Do you still need an attorney?',
  'notif.cases.case_still_needed.body': 'Open the case and answer in one tap.',
};
