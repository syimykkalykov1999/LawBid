import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/misc.dart' show ProviderListenable;
import 'package:lawbid/core/design_system/theme/app_theme_providers.dart';
import 'package:lawbid/core/l10n/language_providers.dart';

/// Our card page (`/pay.html`) takes the app's theme and language, and from
/// the phone app its «Back to the app» opens `lawbid://` — all in the
/// fragment, so none of it reaches a server log (owner 2026-10-16).
/// Owner 2026-10-22: shared by every purchase (subscription, seats, Boost,
/// stars, offer packs, client plan, gold badge).
Uri withPayPageLook(Uri url, {String? theme, String? lang}) {
  if (!url.path.endsWith('/pay.html')) return url;
  final extra = [
    if (theme != null) 'theme=$theme',
    if (lang != null) 'lang=$lang',
    if (!kIsWeb) 'native=1',
  ].join('&');
  if (extra.isEmpty) return url;
  return url.replace(fragment: '${url.fragment}&$extra');
}

/// `ref.read` of a widget or a provider.
typedef ProviderReader = T Function<T>(ProviderListenable<T> provider);

/// [withPayPageLook] with the app's current theme and language; the page
/// opens with its own defaults when either can not be read.
Uri withAppPayPageLook(ProviderReader read, Uri url) {
  String? theme;
  String? lang;
  try {
    theme = read(appThemeControllerProvider)?.name;
  } on Object {
    theme = null;
  }
  try {
    lang = read(languageControllerProvider).value?.code;
  } on Object {
    lang = null;
  }
  return withPayPageLook(url, theme: theme, lang: lang);
}
