import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter/widgets.dart' show visibleForTesting;

import 'package:lawbid/core/l10n/static_strings_assets.dart';

/// Web: the compiled-in strings of [code] once [loadBuiltInStrings] has read
/// them, else `null` (the translator then answers from the cached bundle,
/// English, or the key — the same layers as for a server-only language).
/// See static_strings.dart.
Map<String, String>? builtInStrings(String code) => _loaded[code];

final _loaded = <String, Map<String, String>>{};
final _loading = <String, Future<void>>{};

/// Reads assets/l10n/static_strings_<code>.json once (a second call waits
/// for the same read). A failed read is forgotten, so the next start of the
/// translations tries again; it never throws.
Future<void>? loadBuiltInStrings(String code) {
  if (_loaded.containsKey(code) || !kBuiltInStringLanguages.contains(code)) {
    return null;
  }
  // Removed only after the read has finished (whenComplete runs later, even
  // when the read fails at once), so a failed read is tried again next time.
  return _loading[code] ??= _read(code, readBuiltInStringsAsset)
      .whenComplete(() => _loading.removeWhere((key, _) => key == code));
}

/// Web start (run_app.dart, before the first frame): waits until the strings
/// of [code] are in memory, trying again after each of [retryDelays] when a
/// read fails (offline, a dropped connection). `true` once they are in
/// memory (or [code] has none built in); `false` after the last try, and the
/// start goes on with the cached translations. The HTML splash stays the
/// whole time: no frame is drawn before this ends.
Future<bool>? waitForBuiltInStrings(
  String code, {
  List<Duration> retryDelays = kBuiltInStringsRetryDelays,
}) async {
  for (var attempt = 0;; attempt++) {
    final reading = loadBuiltInStrings(code);
    if (reading != null) await reading;
    if (_loaded.containsKey(code) || !kBuiltInStringLanguages.contains(code)) {
      return true;
    }
    if (attempt >= retryDelays.length) return false;
    await Future<void>.delayed(retryDelays[attempt]);
  }
}

/// How the asset text is read (tests read the file from disk).
@visibleForTesting
Future<String> Function(String asset) readBuiltInStringsAsset =
    (asset) => rootBundle.loadString(asset, cache: false);

Future<void> _read(String code, Future<String> Function(String) read) async {
  try {
    _loaded[code] = decodeBuiltInStrings(await read(builtInStringsAsset(code)));
  } on Object {
    // Offline or a broken asset: the other layers answer; try again later.
  }
}

/// Forgets what was read (tests only).
@visibleForTesting
void resetBuiltInStrings() {
  _loaded.clear();
  _loading.clear();
}
