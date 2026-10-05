// ignore_for_file: lines_longer_than_80_chars
// Owner 2026-10-04: assistants join and sign in with a one-time code the
// attorney gets for each seat (no SMS) — compiled-in strings merged into
// StaticTranslatorRu/En.

const assistantCodeRu = <String, String>{
  'team.code.title': 'Код для входа помощника',
  'team.code.body':
      'Отправьте код помощнику. Он открывает LawBid, нажимает «Я помощник адвоката» и вводит код. Код одноразовый.',
  'team.code.validUntil': 'Действует до {date}',
  'team.code.copy': 'Скопировать',
  'team.code.copied': 'Код скопирован',
  'team.code.send': 'Отправить',
  'team.code.shareText':
      'Ваш код помощника в LawBid: {code}\nОткройте LawBid, нажмите «Я помощник адвоката» и введите код. Действует до {date}.',
  'team.code.new': 'Новый код',
  'team.code.newConfirm': 'Старый код перестанет работать. Создать новый?',
  'team.code.newConfirmActive':
      'Помощник войдёт по новому коду на новом телефоне, а старый телефон выйдет из аккаунта. Создать новый код?',
  'team.code.signedIn':
      'Помощник вошёл. Если он сменил телефон, создайте новый код.',
  'team.code.expired': 'Код истёк. Создайте новый.',
  'team.member.unnamed': 'Помощник',
  'team.add.body':
      'Мы создадим одноразовый код. Отправьте его помощнику: он войдёт без SMS.',
  'team.section.title': 'Ваши помощники',
  'team.section.free': 'Свободных мест: {count}',
  'team.section.manage': 'Права и задачи помощников',
  'plans.seatCodes.hint':
      'После оплаты для каждого помощника будет одноразовый код в разделе Подписка → «Ваши помощники». SMS не нужны.',
  'assistant.code.entry': 'Я помощник адвоката',
  'assistant.code.title': 'Вход помощника',
  'assistant.code.body':
      'Введите код, который дал адвокат. Он есть у адвоката в разделе Подписка → «Ваши помощники».',
  'assistant.code.field': 'Код помощника',
  'assistant.code.submit': 'Войти',
  'assistant.code.invalid':
      'Код не подходит или уже использован. Попросите у адвоката новый.',
  'assistant.code.tooMany': 'Слишком много попыток. Попробуйте позже.',
  'error.api.ASSISTANT_CODE_INVALID':
      'Код не подходит или уже использован. Попросите у адвоката новый.',
};

const assistantCodeEn = <String, String>{
  'team.code.title': "Assistant's sign-in code",
  'team.code.body':
      'Send this code to your assistant. They open LawBid, tap "I\'m an attorney\'s assistant" and enter it. The code works once.',
  'team.code.validUntil': 'Valid until {date}',
  'team.code.copy': 'Copy',
  'team.code.copied': 'Code copied',
  'team.code.send': 'Send',
  'team.code.shareText':
      'Your LawBid assistant code: {code}\nOpen LawBid, tap "I\'m an attorney\'s assistant" and enter the code. Valid until {date}.',
  'team.code.new': 'New code',
  'team.code.newConfirm': 'The old code will stop working. Create a new one?',
  'team.code.newConfirmActive':
      'Your assistant signs in with the new code on a new phone, and the old phone is signed out. Create a new code?',
  'team.code.signedIn':
      'Your assistant is signed in. If they changed phones, create a new code.',
  'team.code.expired': 'The code expired. Create a new one.',
  'team.member.unnamed': 'Assistant',
  'team.add.body':
      "We'll create a one-time code. Send it to your assistant: they sign in without SMS.",
  'team.section.title': 'Your assistants',
  'team.section.free': 'Free seats: {count}',
  'team.section.manage': "Assistants' access and tasks",
  'plans.seatCodes.hint':
      'After payment each assistant gets a one-time code in Subscription → "Your assistants". No SMS needed.',
  'assistant.code.entry': "I'm an attorney's assistant",
  'assistant.code.title': 'Assistant sign-in',
  'assistant.code.body':
      'Enter the code your attorney gave you. They find it in Subscription → "Your assistants".',
  'assistant.code.field': 'Assistant code',
  'assistant.code.submit': 'Sign in',
  'assistant.code.invalid':
      'This code is not valid or was already used. Ask your attorney for a new one.',
  'assistant.code.tooMany': 'Too many attempts. Try again later.',
  'error.api.ASSISTANT_CODE_INVALID':
      'This code is not valid or was already used. Ask your attorney for a new one.',
};
