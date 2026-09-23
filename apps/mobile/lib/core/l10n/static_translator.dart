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
        'common.cancel': 'Отмена',
        'common.confirm': 'Подтвердить',
        'lang.toggle.label': 'Выбрать язык',
        'theme.toggle.label': 'Тема',
        'lang.picker.title': 'Язык',
        'lang.picker.search.hint': 'Поиск языка',
        'lang.picker.empty': 'Ничего не найдено',
        'lang.picker.comingSoon': 'Скоро',
        'settings.title': 'Настройки',
        'settings.account': 'Аккаунт',
        'settings.security': 'Безопасность',
        'settings.language': 'Язык',
        'settings.theme': 'Тема',
        'settings.theme.system': 'Системная',
        'settings.theme.light': 'Светлая',
        'settings.theme.dark': 'Тёмная',
        'settings.subscription': 'Подписка',
        'settings.caseHistory': 'История кейсов',
        'settings.notifications': 'Уведомления',
        'settings.help': 'Помощь',
        'settings.legal': 'Правовая информация',
        'settings.logout': 'Выйти',
        'settings.deleteAccount': 'Удалить аккаунт',
        // Active devices screen (Phase 4 of the auth networking work,
        // docs/CHANGELOG.md), reachable from Settings -> Безопасность
        // (file 01 §10.4: "Активные устройства").
        'devices.title': 'Активные устройства',
        'devices.subtitle': 'Устройства, на которых выполнен вход в ваш аккаунт',
        'devices.current': 'Это устройство',
        'devices.lastActive': 'Последняя активность: {time}',
        'devices.lastActive.unknown': 'Нет данных об активности',
        'devices.unknownDevice': 'Неизвестное устройство',
        'devices.revoke': 'Завершить сессию',
        'devices.revoke.confirm.title': 'Завершить сессию?',
        'devices.revoke.confirm.body':
            'Устройство будет разлогинено. Потребуется повторный вход.',
        'devices.revoke.confirm.currentBody':
            'Это текущее устройство. Вы будете разлогинены и потребуется повторный вход.',
        'devices.revoke.confirm.action': 'Завершить',
        'devices.logoutAll': 'Выйти на всех устройствах',
        'devices.logoutAll.confirm.title': 'Выйти везде?',
        'devices.logoutAll.confirm.body':
            'Все устройства будут разлогинены, включая это. Потребуется повторный вход.',
        'devices.empty': 'Нет активных сессий',
        'devices.error': 'Не удалось загрузить список устройств',
        // Delete-account screen (Phase 4 of the auth networking work,
        // docs/CHANGELOG.md; file 01 §10.7). Reauth step is OTP-only
        // server-side (see ReauthDto's doc comment in apps/api) — biometric
        // is offered first as a local speed bump, see
        // deleteAccount.reauth.biometric.*.
        'deleteAccount.title': 'Удаление аккаунта',
        'deleteAccount.warning.title': 'Это необратимо',
        'deleteAccount.warning.body':
            'Аккаунт будет удалён через 14 дней после подтверждения. Вы можете '
                'отменить удаление, просто войдя в аккаунт снова в течение этого срока. '
                'После истечения 14 дней личные данные будут анонимизированы, активные '
                'кейсы закрыты, биды отклонены, подписка отменена.',
        'deleteAccount.warning.continue': 'Продолжить',
        'deleteAccount.reauth.title': 'Подтвердите личность',
        'deleteAccount.reauth.biometric.button': 'Использовать Face ID / Touch ID',
        'deleteAccount.reauth.biometric.prompt': 'Подтвердите личность, чтобы продолжить',
        'deleteAccount.reauth.useCode': 'Использовать код по SMS',
        'deleteAccount.reauth.phoneHint': 'Номер телефона, привязанный к аккаунту',
        'deleteAccount.reauth.sendCode': 'Отправить код',
        'deleteAccount.reauth.codeSubtitle': 'Мы отправили код на {phone}',
        'deleteAccount.reauth.submit': 'Подтвердить код',
        'deleteAccount.reauth.error.invalid':
            'Неверный код, или номер не привязан к вашему аккаунту',
        'deleteAccount.reauth.error.network': 'Ошибка сети, попробуйте снова',
        'deleteAccount.reauth.error.expired': 'Подтверждение истекло, попробуйте снова',
        'deleteAccount.confirmPhrase.title': 'Финальное подтверждение',
        'deleteAccount.confirmPhrase.label': 'Введите {phrase}, чтобы подтвердить',
        'deleteAccount.confirmPhrase.phrase': 'УДАЛИТЬ',
        'deleteAccount.confirmPhrase.mismatch': 'Введите слово точно, как показано',
        'deleteAccount.submit': 'Удалить аккаунт навсегда',
        'deleteAccount.success.title': 'Аккаунт будет удалён',
        'deleteAccount.success.body':
            'У вас есть 14 дней, чтобы отменить удаление — просто войдите снова.',
        'deleteAccount.success.action': 'Понятно',
        'deleteAccount.error.generic': 'Не удалось удалить аккаунт. Попробуйте снова.',
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
        // Phase 3 of the auth networking work (docs/CHANGELOG.md) —
        // `POST /auth/social` failure modes surfaced by
        // OnboardingFlow._signInWithSocial. {identifier}/{methods} are
        // filled from the backend's ACCOUNT_EXISTS_USE_OTHER_METHOD
        // `details.maskedIdentifier`/`details.availableMethods`.
        'auth.social.error.invalidToken': 'Не удалось подтвердить вход. Попробуйте снова.',
        'auth.social.error.providerDisabled': 'Этот способ входа временно недоступен.',
        'auth.social.error.accountExists':
            'Аккаунт с {identifier} уже существует. Войдите через: {methods}.',
        'auth.social.error.suspended': 'Аккаунт заблокирован. Обратитесь в поддержку.',
        'auth.social.error.deleted': 'Этот аккаунт был удалён.',
        'auth.social.error.network': 'Ошибка сети, попробуйте снова',
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
        'common.cancel': 'Cancel',
        'common.confirm': 'Confirm',
        'lang.toggle.label': 'Choose language',
        'theme.toggle.label': 'Theme',
        'lang.picker.title': 'Language',
        'lang.picker.search.hint': 'Search language',
        'lang.picker.empty': 'No results',
        'lang.picker.comingSoon': 'Coming soon',
        'settings.title': 'Settings',
        'settings.account': 'Account',
        'settings.security': 'Security',
        'settings.language': 'Language',
        'settings.theme': 'Theme',
        'settings.theme.system': 'System',
        'settings.theme.light': 'Light',
        'settings.theme.dark': 'Dark',
        'settings.subscription': 'Subscription',
        'settings.caseHistory': 'Case history',
        'settings.notifications': 'Notifications',
        'settings.help': 'Help',
        'settings.legal': 'Legal',
        'settings.logout': 'Log out',
        'settings.deleteAccount': 'Delete account',
        'devices.title': 'Active devices',
        'devices.subtitle': 'Devices currently signed in to your account',
        'devices.current': 'This device',
        'devices.lastActive': 'Last active: {time}',
        'devices.lastActive.unknown': 'No activity recorded',
        'devices.unknownDevice': 'Unknown device',
        'devices.revoke': 'End session',
        'devices.revoke.confirm.title': 'End this session?',
        'devices.revoke.confirm.body': 'This device will be signed out and will need to sign in again.',
        'devices.revoke.confirm.currentBody':
            'This is your current device. You will be signed out and will need to sign in again.',
        'devices.revoke.confirm.action': 'End session',
        'devices.logoutAll': 'Sign out of all devices',
        'devices.logoutAll.confirm.title': 'Sign out everywhere?',
        'devices.logoutAll.confirm.body':
            'Every device will be signed out, including this one. You will need to sign in again.',
        'devices.empty': 'No active sessions',
        'devices.error': "Couldn't load your devices",
        'deleteAccount.title': 'Delete account',
        'deleteAccount.warning.title': "This can't be undone",
        'deleteAccount.warning.body':
            'Your account will be deleted 14 days after you confirm. You can cancel by '
                "simply signing back in during that window. After 14 days, your personal "
                'data is anonymized, active cases are closed, bids are rejected, and any '
                'subscription is cancelled.',
        'deleteAccount.warning.continue': 'Continue',
        'deleteAccount.reauth.title': 'Confirm it\'s you',
        'deleteAccount.reauth.biometric.button': 'Use Face ID / Touch ID',
        'deleteAccount.reauth.biometric.prompt': 'Confirm it\'s you to continue',
        'deleteAccount.reauth.useCode': 'Use a text message code instead',
        'deleteAccount.reauth.phoneHint': 'Phone number linked to your account',
        'deleteAccount.reauth.sendCode': 'Send code',
        'deleteAccount.reauth.codeSubtitle': 'We sent a code to {phone}',
        'deleteAccount.reauth.submit': 'Confirm code',
        'deleteAccount.reauth.error.invalid':
            "Incorrect code, or that number isn't linked to your account",
        'deleteAccount.reauth.error.network': 'Network error, please try again',
        'deleteAccount.reauth.error.expired': 'Confirmation expired, please try again',
        'deleteAccount.confirmPhrase.title': 'Final confirmation',
        'deleteAccount.confirmPhrase.label': 'Type {phrase} to confirm',
        'deleteAccount.confirmPhrase.phrase': 'DELETE',
        'deleteAccount.confirmPhrase.mismatch': 'Type the word exactly as shown',
        'deleteAccount.submit': 'Permanently delete account',
        'deleteAccount.success.title': 'Your account will be deleted',
        'deleteAccount.success.body':
            'You have 14 days to cancel — just sign back in.',
        'deleteAccount.success.action': 'Got it',
        'deleteAccount.error.generic': "Couldn't delete your account. Please try again.",
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
        // Phase 3 of the auth networking work (docs/CHANGELOG.md) — see
        // the matching RU comment above.
        'auth.social.error.invalidToken': "Couldn't verify sign-in. Please try again.",
        'auth.social.error.providerDisabled': 'This sign-in method is temporarily unavailable.',
        'auth.social.error.accountExists':
            'An account with {identifier} already exists. Sign in with: {methods}.',
        'auth.social.error.suspended': 'This account has been suspended. Contact support.',
        'auth.social.error.deleted': 'This account has been deleted.',
        'auth.social.error.network': 'Network error, please try again',
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
