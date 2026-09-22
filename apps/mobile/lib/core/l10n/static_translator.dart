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
