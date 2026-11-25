// Owner 2026-10-28: «Подтвердите, что это вы» asks for the account password
// instead of a paid SMS code (case history, data export, account deletion,
// contact change). Owner 25.11 (`auth.code_channel`): the fallback code
// goes by SMS by default (`.sms` texts) or to the e-mail once the admin
// chooses «Почта». Other languages: the seed translations.

const stepUpRu = <String, String>{
  'stepUp.password.body': 'Введите пароль от аккаунта.',
  'stepUp.password.submit': 'Подтвердить',
  'stepUp.password.wrong': 'Неверный пароль.',
  'stepUp.password.locked':
      'Слишком много попыток. Попробуйте позже или получите код на почту.',
  'stepUp.useCode': 'Забыли пароль? Получить код на почту',
  'stepUp.password.locked.sms':
      'Слишком много попыток. Попробуйте позже или получите код по SMS.',
  'stepUp.useCode.sms': 'Забыли пароль? Получить код по SMS',
};

const stepUpEn = <String, String>{
  'stepUp.password.body': 'Enter your account password.',
  'stepUp.password.submit': 'Confirm',
  'stepUp.password.wrong': 'Incorrect password.',
  'stepUp.password.locked':
      'Too many attempts. Try again later or get a code by email.',
  'stepUp.useCode': 'Forgot password? Get a code by email',
  'stepUp.password.locked.sms':
      'Too many attempts. Try again later or get a code by SMS.',
  'stepUp.useCode.sms': 'Forgot password? Get a code by SMS',
};
