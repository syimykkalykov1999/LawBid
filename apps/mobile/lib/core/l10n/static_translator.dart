import 'translator.dart';

/// Stage-1.5-only [Translator]: a hardcoded Russian string table.
///
/// Scope is intentionally narrow — ONLY the keys stage 1.5's shell/stub
/// screens and shared empty/error states need. The keys from file 07 §8
/// (auth.*, onboarding.*, brand.*) belong to stage 1.7's screens and are
/// NOT duplicated here; they'll be added to `translations_seed.xlsx` and
/// loaded through the real L10n layer when stage 1.6/1.7 land.
///
/// `nav.*` / `empty.*` / `error.*` keys below are NOT in file 07 §8's table
/// (which only covers the auth/onboarding screens) — file 01 §3 gives their
/// Russian copy directly ("Лента | Поиск | + | Моё | Профиль"), so these
/// keys are a necessary, spec-consistent addition. Flagged here so stage 1.6
/// merges them into translations_seed.xlsx rather than re-deriving them.
///
/// `auth.*` / `onboarding.*` / `brand.*` keys ARE in file 07 §8's table —
/// added here in stage 1.7 (docs/CHANGELOG.md) because the 4 auth/onboarding
/// screens need real text NOW, before stage 1.6's real L10n layer exists.
/// This is exactly the seam `Translator`/`StaticTranslator` was built for
/// (see translator.dart doc comment): stage 1.6 moves these into
/// `translations_seed.xlsx` and no call site (`t('auth.welcome.title')`
/// etc.) changes. A few keys below (`common.back`, `auth.phone.fieldLabel`,
/// `auth.phone.error.*`, `auth.otp.error.*`) are NOT in file 07 §8's table
/// either — same category as `nav.*`/`empty.*`/`error.*`: necessary,
/// spec-consistent UI copy the table doesn't happen to enumerate.
class StaticTranslator implements Translator {
  const StaticTranslator();

  static const Map<String, String> _strings = {
    'nav.tab.feed': 'Лента',
    'nav.tab.search': 'Поиск',
    'nav.tab.mine': 'Моё',
    'nav.tab.profile': 'Профиль',
    'nav.create': 'Создать',
    'feed.stub.title': 'Лента',
    'search.stub.title': 'Поиск',
    'mine.stub.title': 'Моё',
    'profile.stub.title': 'Профиль',
    'create.stub.title': 'Создать',
    'empty.default.message': 'Здесь пока пусто',
    'error.default.message': 'Что-то пошло не так',
    'error.retry': 'Повторить',

    // file 07 §8 — auth/onboarding screens (see class doc comment above).
    'common.back': 'Назад',
    'auth.welcome.title': 'Доска объявлений для клиентов и адвокатов',
    'auth.welcome.phone': 'Продолжить с телефоном',
    'auth.welcome.email': 'Продолжить с email',
    'auth.welcome.apple': 'Продолжить с Apple',
    'auth.welcome.google': 'Продолжить с Google',
    'auth.welcome.legal':
        'LawBid — доска объявлений. Мы не юридическая фирма и не оказываем '
            'юридических услуг. Продолжая, вы принимаете Условия и Политику '
            'конфиденциальности.',
    'auth.welcome.legal.terms': 'Условия',
    'auth.welcome.legal.privacy': 'Политику конфиденциальности',
    'auth.welcome.notBuiltYet': 'Этот способ входа пока не реализован (этап 1.4/1.7)',
    'auth.phone.title': 'Ваш номер телефона',
    'auth.phone.subtitle': 'Мы отправим код подтверждения. Пароль не нужен.',
    'auth.phone.submit': 'Получить код',
    'auth.phone.terms': 'Продолжая, вы принимаете Условия использования и Политику конфиденциальности',
    'auth.phone.terms.usage': 'Условия использования',
    'auth.phone.terms.privacy': 'Политику конфиденциальности',
    'auth.phone.fieldLabel': 'Номер телефона',
    'auth.phone.error.invalid': 'Введите корректный номер телефона',
    'auth.otp.title': 'Введите код',
    'auth.otp.subtitle': 'Мы отправили его на {phone}',
    'auth.otp.resendIn': 'Отправить снова через {time}',
    'auth.otp.resend': 'Отправить код снова',
    'auth.otp.submit': 'Подтвердить',
    'onboarding.role.title': 'Как вы будете пользоваться LawBid?',
    'onboarding.role.client.title': 'Клиент',
    'onboarding.role.client.desc': 'Опубликуйте кейс и выбирайте предложения адвокатов.',
    'onboarding.role.attorney.title': 'Адвокат',
    'onboarding.role.attorney.badge': 'PRO',
    'onboarding.role.attorney.desc':
        'Лицензированный юрист: находите клиентов по своей практике и штату.',
    'onboarding.role.continue': 'Продолжить',
    'onboarding.role.warning': 'Роль потом изменить нельзя',
    'brand.name': 'LawBid',
    'brand.pan.left': 'Law',
    'brand.pan.right': 'Bid',
  };

  @override
  String t(String key, [Map<String, String>? params]) {
    var value = _strings[key];
    assert(value != null, 'Missing translation key: $key');
    value ??= key;
    if (params == null) return value;
    for (final entry in params.entries) {
      value = value!.replaceAll('{${entry.key}}', entry.value);
    }
    return value!;
  }
}
