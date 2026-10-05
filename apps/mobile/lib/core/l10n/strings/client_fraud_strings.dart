// ignore_for_file: lines_longer_than_80_chars
// Owner 2026-10-05: repeat accounts of blocked fraudsters
// (docs/CLIENT_FRAUD.md) — an account limited while staff check it.
// Honest and short: what is limited and how to appeal, never which signal
// matched (that would teach evasion).

const clientFraudRu = <String, String>{
  'error.api.ACCOUNT_RESTRICTED':
      'Аккаунт временно ограничен на время проверки. Если это ошибка, напишите в поддержку.',
  'account.restricted.title': 'Аккаунт ограничен',
  'account.restricted.body':
      'Пока мы проверяем аккаунт, нельзя публиковать кейсы и писать адвокатам. Если вы считаете это ошибкой, напишите в поддержку: мы ответим и снимем ограничение.',
  'account.restricted.support': 'Написать в поддержку',
  'account.restricted.ok': 'Понятно',
};

const clientFraudEn = <String, String>{
  'error.api.ACCOUNT_RESTRICTED':
      'Your account is limited while we check it. If this is a mistake, please write to support.',
  'account.restricted.title': 'Account limited',
  'account.restricted.body':
      "While we check your account, you can't publish cases or write to attorneys. If you think this is a mistake, write to support: we'll reply and lift the limit.",
  'account.restricted.support': 'Write to support',
  'account.restricted.ok': 'Got it',
};
