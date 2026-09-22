import 'app_language.dart';
import 'translator.dart';

/// Stage-1.5-originated stopgap [Translator], now bilingual (owner request,
/// 2026-09-22): a working RU/EN toggle on the welcome screen, ahead of the
/// real i18n system (backend-driven languages, xlsx import/export, drift
/// cache, live switching — file 01 §15, stage 1.6, not yet built).
///
/// Every key that existed in the app (not just auth/onboarding) has an
/// English counterpart here, specifically so switching languages never hits
/// the `assert(value != null, ...)` below on a stub screen that only had
/// Russian before. Stage 1.6 replaces this whole file with the real L10n
/// layer behind the same [Translator] interface (see translator.dart doc
/// comment) — call sites (`t('key')`) do not change.
///
/// File 01 §1 specifies English as the DEFAULT interface language — see
/// [LocalLanguageRepository] in local_language_repository.dart, which
/// defaults to [AppLanguage.en] when nothing has been persisted yet.
abstract class _MapTranslator implements Translator {
  const _MapTranslator();

  Map<String, String> get _strings;

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

/// Russian strings — the original stage-1.5/1.7 table, unchanged in content.
class StaticTranslatorRu extends _MapTranslator {
  const StaticTranslatorRu();

  @override
  Map<String, String> get _strings => const {
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
        'common.back': 'Назад',
        'lang.toggle.label': 'Выбрать язык',
        'theme.toggle.label': 'Тема',
        'lang.picker.title': 'Язык',
        'lang.picker.search.hint': 'Поиск языка',
        'lang.picker.empty': 'Ничего не найдено',
        'lang.picker.comingSoon': 'Скоро',
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
        'auth.phone.terms':
            'Продолжая, вы принимаете Условия использования и Политику конфиденциальности',
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
        'onboarding.role.client.desc':
            'Опубликуйте кейс и выбирайте предложения адвокатов.',
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
}

/// English strings — the default language per file 01 §1.
class StaticTranslatorEn extends _MapTranslator {
  const StaticTranslatorEn();

  @override
  Map<String, String> get _strings => const {
        'nav.tab.feed': 'Feed',
        'nav.tab.search': 'Search',
        'nav.tab.mine': 'Mine',
        'nav.tab.profile': 'Profile',
        'nav.create': 'Create',
        'feed.stub.title': 'Feed',
        'search.stub.title': 'Search',
        'mine.stub.title': 'Mine',
        'profile.stub.title': 'Profile',
        'create.stub.title': 'Create',
        'empty.default.message': 'Nothing here yet',
        'error.default.message': 'Something went wrong',
        'error.retry': 'Retry',
        'common.back': 'Back',
        'lang.toggle.label': 'Choose language',
        'theme.toggle.label': 'Theme',
        'lang.picker.title': 'Language',
        'lang.picker.search.hint': 'Search language',
        'lang.picker.empty': 'No results',
        'lang.picker.comingSoon': 'Coming soon',
        'auth.welcome.title': 'A marketplace for clients and attorneys',
        'auth.welcome.phone': 'Continue with phone',
        'auth.welcome.email': 'Continue with email',
        'auth.welcome.apple': 'Continue with Apple',
        'auth.welcome.google': 'Continue with Google',
        'auth.welcome.legal':
            "LawBid is a listings marketplace. We are not a law firm and do not "
                "provide legal services. By continuing, you agree to the Terms and "
                "Privacy Policy.",
        'auth.welcome.legal.terms': 'Terms',
        'auth.welcome.legal.privacy': 'Privacy Policy',
        'auth.welcome.notBuiltYet': "This sign-in method isn't available yet (stage 1.4/1.7)",
        'auth.phone.title': 'Your phone number',
        'auth.phone.subtitle': "We'll text you a verification code. No password needed.",
        'auth.phone.submit': 'Get code',
        'auth.phone.terms':
            'By continuing, you agree to the Terms of Use and Privacy Policy',
        'auth.phone.terms.usage': 'Terms of Use',
        'auth.phone.terms.privacy': 'Privacy Policy',
        'auth.phone.fieldLabel': 'Phone number',
        'auth.phone.error.invalid': 'Enter a valid phone number',
        'auth.otp.title': 'Enter the code',
        'auth.otp.subtitle': 'We sent it to {phone}',
        'auth.otp.resendIn': 'Resend in {time}',
        'auth.otp.resend': 'Resend code',
        'auth.otp.submit': 'Confirm',
        'onboarding.role.title': 'How will you use LawBid?',
        'onboarding.role.client.title': 'Client',
        'onboarding.role.client.desc':
            'Post a case and choose from attorney offers.',
        'onboarding.role.attorney.title': 'Attorney',
        'onboarding.role.attorney.badge': 'PRO',
        'onboarding.role.attorney.desc':
            'Licensed attorney: find clients by your practice area and state.',
        'onboarding.role.continue': 'Continue',
        'onboarding.role.warning': "You can't change your role later",
        'brand.name': 'LawBid',
        'brand.pan.left': 'Law',
        'brand.pan.right': 'Bid',
      };
}
