// ignore_for_file: lines_longer_than_80_chars
// R2-A batch D (14.11): Log out confirm, «sign out of other devices».
// Other languages: apps/api/prisma/seed/translations (pending_keys/r2-account-safety.json).

const accountSafetyRu = <String, String>{
  'devices.logoutOthers': 'Выйти на других устройствах',
  'devices.logoutOthers.confirm.title': 'Выйти на других устройствах?',
  'devices.logoutOthers.confirm.body':
      'Все устройства, кроме этого, выйдут из аккаунта.',
  'devices.logoutOthers.confirm.action': 'Выйти',
  'devices.logoutOthers.done': 'Другие устройства вышли из аккаунта',
  'settings.logout.confirm.title': 'Выйти из аккаунта?',
  'settings.logout.confirm.body':
      'Войти снова можно по номеру телефона и паролю.',
};

const accountSafetyEn = <String, String>{
  'devices.logoutOthers': 'Sign out of other devices',
  'devices.logoutOthers.confirm.title': 'Sign out of other devices?',
  'devices.logoutOthers.confirm.body':
      'Every device except this one will be signed out.',
  'devices.logoutOthers.confirm.action': 'Sign out',
  'devices.logoutOthers.done': 'Other devices are signed out',
  'settings.logout.confirm.title': 'Log out?',
  'settings.logout.confirm.body':
      'To come back, sign in with your phone number and password.',
};
