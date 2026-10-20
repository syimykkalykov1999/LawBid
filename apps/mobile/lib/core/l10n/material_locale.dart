import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:lawbid/core/l10n/app_language.dart';

/// Owner 2026-10-20 (phone test): in Russian the date and time dialogs still
/// said «Select date», «Select time», «Cancel», «OK», «AM/PM» — the app
/// shipped no Flutter localization delegates. These make Material, Cupertino
/// and the widgets layer follow the app's own language, with a nearest-
/// language fallback for the few languages Flutter has no texts for.

/// The Flutter locale for an app language code (`zh-tw` → Traditional
/// Chinese, Taiwan).
Locale flutterLocaleFor(AppLanguage language) =>
    flutterLocaleForCode(language.code);

/// [flutterLocaleFor] by code.
Locale flutterLocaleForCode(String code) {
  if (code == AppLanguage.traditionalChinese) {
    return const Locale.fromSubtags(
      languageCode: 'zh',
      scriptCode: 'Hant',
      countryCode: 'TW',
    );
  }
  return Locale(code.split('-').first);
}

/// The nearest language Flutter has dialog texts for, when it has none for
/// the app's. Related languages first; English for the rest.
const _nearest = <String, String>{
  'ht': 'fr', // Haitian Creole
  'tg': 'ru', // Tajik
  'tk': 'tr', // Turkmen
  'ku': 'tr', // Kurdish (Kurmanji)
  'so': 'sw', // Somali
};

/// The locale whose dialog texts stand in for an unsupported [locale].
Locale fallbackLocaleFor(Locale locale) =>
    Locale(_nearest[locale.languageCode] ?? 'en');

/// Wraps a Flutter delegate so that every app language loads: its own texts
/// when Flutter has them, [fallbackLocaleFor] otherwise.
class FallbackLocalizationsDelegate<T> extends LocalizationsDelegate<T> {
  const FallbackLocalizationsDelegate(this._inner);

  final LocalizationsDelegate<T> _inner;

  @override
  bool isSupported(Locale locale) => true;

  @override
  Future<T> load(Locale locale) => _inner.load(
        _inner.isSupported(locale) ? locale : fallbackLocaleFor(locale),
      );

  @override
  bool shouldReload(FallbackLocalizationsDelegate<T> old) => false;
}

/// The delegates for `MaterialApp.localizationsDelegates`.
final List<LocalizationsDelegate<dynamic>> appLocalizationsDelegates = [
  const FallbackLocalizationsDelegate<MaterialLocalizations>(
    GlobalMaterialLocalizations.delegate,
  ),
  const FallbackLocalizationsDelegate<WidgetsLocalizations>(
    GlobalWidgetsLocalizations.delegate,
  ),
  const FallbackLocalizationsDelegate<CupertinoLocalizations>(
    GlobalCupertinoLocalizations.delegate,
  ),
];

/// `MaterialApp.localeResolutionCallback`: the app's language is used as it
/// is — the delegates above cover languages Flutter lacks.
Locale? keepRequestedLocale(Locale? locale, Iterable<Locale> supported) =>
    locale ?? supported.first;

/// Whether Flutter itself ships texts for [locale] (for tests and docs).
@visibleForTesting
bool flutterSupports(Locale locale) =>
    GlobalMaterialLocalizations.delegate.isSupported(locale);
