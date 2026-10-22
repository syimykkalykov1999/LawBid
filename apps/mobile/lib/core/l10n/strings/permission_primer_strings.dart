// ignore_for_file: lines_longer_than_80_chars
// Owner 2026-10-22 (audit #13): the short explanation before the phone's
// notification and microphone dialogs — merged into StaticTranslatorRu/En.
// All 85 languages are in apps/api/prisma/seed/translations_seed.xlsx.

const permissionPrimerRu = <String, String>{
  'perm.notif.title': 'Включите уведомления',
  'perm.notif.body':
      'Чтобы не пропустить звонок или сообщение от юриста или клиента, даже когда LawBid закрыт. Изменить можно в любой момент в настройках.',
  'perm.mic.title': 'Разрешите микрофон',
  'perm.mic.body':
      'LawBid включает микрофон только во время звонка, чтобы собеседник вас слышал.',
  'perm.mic.lockScreen':
      'Разрешите сейчас — тогда звонок можно принять прямо с экрана блокировки.',
  'perm.continue': 'Продолжить',
  'perm.notNow': 'Не сейчас',
};

const permissionPrimerEn = <String, String>{
  'perm.notif.title': 'Turn on notifications',
  'perm.notif.body':
      "So you don't miss a call or a message from your lawyer or client, even when LawBid is closed. You can change this any time in Settings.",
  'perm.mic.title': 'Allow the microphone',
  'perm.mic.body':
      'LawBid uses the microphone only during a call, so the other person can hear you.',
  'perm.mic.lockScreen':
      'Allow it now so you can answer a call right from the lock screen.',
  'perm.continue': 'Continue',
  'perm.notNow': 'Not now',
};
