/// Where the compiled-in Russian and English strings come from
/// (`StaticTranslatorRu`/`En`, the seed/fallback layer of `L10nTranslator`).
///
/// Web bundle budget (17.11, KNOWN_ERRORS 175/203): on phones, desktops and
/// in tests they are Dart constants (static_strings_compiled.dart). On the
/// web the same rows are the assets assets/l10n/static_strings_<code>.json,
/// read once by `loadBuiltInStrings` while the translations load at start;
/// before that `builtInStrings` answers `null`. The WebAssembly and
/// JavaScript builds are about 0.25 MB (brotli) lighter for it.
library;

export 'static_strings_native.dart'
    if (dart.library.js_interop) 'static_strings_web.dart';
