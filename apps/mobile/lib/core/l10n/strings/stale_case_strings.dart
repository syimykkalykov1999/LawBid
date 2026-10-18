// ignore_for_file: lines_longer_than_80_chars
// Owner 2026-10-17/18 (OQ-054): «Кейс ещё актуален?», the pause, and the
// notification — merged into StaticTranslatorRu/En.

const staleCaseRu = <String, String>{
  'cases.stale.title': 'Вы давно не заходили в этот кейс — он ещё актуален?',
  'cases.stale.hint':
      'Мы спрашиваем, чтобы адвокаты не тратили время на неактуальные кейсы. Если не ответите в ближайшие дни, кейс скроется из ленты адвокатов. Ничего не удалится: вернуть его можно одним касанием.',
  'cases.stale.hintDate':
      'Мы спрашиваем, чтобы адвокаты не тратили время на неактуальные кейсы. Если не ответите до {date}, кейс скроется из ленты адвокатов. Ничего не удалится: вернуть его можно одним касанием.',
  'cases.stale.answersHint':
      '«Да, ещё нужен» и «Жду предложений получше» оставят кейс в ленте. «Уже не нужен» закроет кейс.',
  'cases.stale.yes': 'Да, ещё нужен',
  'cases.stale.wait': 'Жду предложений получше',
  'cases.stale.no': 'Уже не нужен',
  'cases.stale.notUrgent': 'Сменить на «Не срочно»',
  'cases.stale.paused': 'Кейс скрыт из ленты адвокатов — вы давно не отвечали',
  'cases.stale.pausedHint':
      'Адвокаты его сейчас не видят и не присылают предложения. Нажмите «Вернуть в ленту», и кейс снова появится.',
  'cases.stale.pausedHintDate':
      'Адвокаты его сейчас не видят и не присылают предложения. Нажмите «Вернуть в ленту», и кейс снова появится. Если не вернуть до {date}, кейс уйдёт в архив.',
  'cases.stale.resume': 'Вернуть в ленту',
  'cases.stale.pausedPill': 'На паузе',
  'cases.stale.answered': 'Спасибо, кейс остаётся в ленте',
  'cases.stale.resumed': 'Кейс снова в ленте',
  'cases.stale.notUrgentDone': 'Срочность изменена на «Не срочно»',
  'notif.list.case_still_needed.one':
      'Ваш кейс ещё актуален? Вы давно не заходили в {count} кейс',
  'notif.list.case_still_needed.few':
      'Ваши кейсы ещё актуальны? Вы давно не заходили в {count} кейса',
  'notif.list.case_still_needed.many':
      'Ваши кейсы ещё актуальны? Вы давно не заходили в {count} кейсов',
  'notif.list.case_still_needed.other':
      'Ваши кейсы ещё актуальны? Вы давно не заходили в {count} кейса',
  'notif.cases.case_still_needed.title': 'Ваш кейс ещё актуален?',
  'notif.cases.case_still_needed.body':
      'Вы давно не заходили. Ответьте в одно касание, иначе кейс скроется из ленты адвокатов.',
};

const staleCaseEn = <String, String>{
  'cases.stale.title':
      'You have not opened this case in a while. Is it still current?',
  'cases.stale.hint':
      'We ask so attorneys do not waste time on outdated cases. If you do not answer in the next few days, the case is hidden from the attorneys’ feed. Nothing is deleted: you can bring it back with one tap.',
  'cases.stale.hintDate':
      'We ask so attorneys do not waste time on outdated cases. If you do not answer by {date}, the case is hidden from the attorneys’ feed. Nothing is deleted: you can bring it back with one tap.',
  'cases.stale.answersHint':
      '“Yes, still needed” and “Waiting for better offers” keep the case in the feed. “No longer needed” closes the case.',
  'cases.stale.yes': 'Yes, still needed',
  'cases.stale.wait': 'Waiting for better offers',
  'cases.stale.no': 'No longer needed',
  'cases.stale.notUrgent': 'Change to “Not urgent”',
  'cases.stale.paused':
      'Case hidden from the attorneys’ feed — no answer for a while',
  'cases.stale.pausedHint':
      'Attorneys cannot see it or send offers now. Tap “Back to feed” and it appears again.',
  'cases.stale.pausedHintDate':
      'Attorneys cannot see it or send offers now. Tap “Back to feed” and it appears again. If you do not bring it back by {date}, it moves to the archive.',
  'cases.stale.resume': 'Back to feed',
  'cases.stale.pausedPill': 'Paused',
  'cases.stale.answered': 'Thanks, your case stays in the feed',
  'cases.stale.resumed': 'Your case is back in the feed',
  'cases.stale.notUrgentDone': 'Urgency changed to “Not urgent”',
  'notif.list.case_still_needed.one':
      'Is your case still current? You have not opened {count} case in a while',
  'notif.list.case_still_needed.other':
      'Are your cases still current? You have not opened {count} cases in a while',
  'notif.cases.case_still_needed.title': 'Is your case still current?',
  'notif.cases.case_still_needed.body':
      'You have not opened it in a while. Answer in one tap, or it is hidden from the attorneys’ feed.',
};
