import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_mlkit_language_id/google_mlkit_language_id.dart';
import 'package:google_mlkit_translation/google_mlkit_translation.dart';

/// Why a translation on the phone did not happen. [key] is the short
/// translation key the app shows.
enum DeviceTranslateFailure {
  /// Web and desktop: ML Kit exists on Android and iOS only.
  unavailable('translate.web'),

  /// The text's language could not be told (too short, numbers, emoji).
  sourceUnknown('translate.unsupported'),

  /// ML Kit has no model for the text's language.
  sourceUnsupported('translate.unsupported'),

  /// ML Kit has no model for the app language.
  targetUnsupported('translate.unsupported'),

  /// The text is already in the app language.
  sameLanguage('translate.same'),

  /// A language model has to be fetched and the phone is not on Wi-Fi: the
  /// ~30 MB download never uses mobile data.
  wifi('translate.wifi'),

  /// The language model could not be downloaded (offline, storage).
  download('translate.download.failed'),

  /// Anything else the plugin reported.
  failed('translate.failed');

  const DeviceTranslateFailure(this.key);

  final String key;
}

class DeviceTranslateException implements Exception {
  const DeviceTranslateException(this.reason);

  final DeviceTranslateFailure reason;

  @override
  String toString() => 'DeviceTranslateException($reason)';
}

/// The few ML Kit calls the app needs; tests replace it.
abstract interface class TranslationEngine {
  /// BCP-47 code of the text's language, or null when unknown.
  Future<String?> detect(String text);

  Future<bool> hasModel(String code);

  /// The phone is on Wi-Fi or Ethernet (a model download is allowed).
  Future<bool> onWifi();

  /// Downloads the model; false = it did not arrive.
  Future<bool> downloadModel(String code);

  Future<String> translate(String text, String from, String to);
}

class MlKitTranslationEngine implements TranslationEngine {
  final _models = OnDeviceTranslatorModelManager();

  @override
  Future<String?> detect(String text) async {
    final id = LanguageIdentifier(confidenceThreshold: 0.4);
    try {
      final code = await id.identifyLanguage(text);
      return code == 'und' ? null : code;
    } finally {
      await id.close();
    }
  }

  @override
  Future<bool> hasModel(String code) => _models.isModelDownloaded(code);

  @override
  Future<bool> onWifi() async {
    final now = await Connectivity().checkConnectivity();
    return now.contains(ConnectivityResult.wifi) ||
        now.contains(ConnectivityResult.ethernet);
  }

  @override
  Future<bool> downloadModel(String code) => _models.downloadModel(code);

  @override
  Future<String> translate(String text, String from, String to) async {
    final translator = OnDeviceTranslator(
      sourceLanguage: _languageOf(from)!,
      targetLanguage: _languageOf(to)!,
    );
    try {
      return await translator.translateText(text);
    } finally {
      await translator.close();
    }
  }
}

final Map<String, TranslateLanguage> _byCode = {
  for (final l in TranslateLanguage.values) l.bcpCode: l,
};

TranslateLanguage? _languageOf(String code) => _byCode[code];

/// The ML Kit code for an app language code or a detected tag: `nb` →
/// `no`, `zh-tw` → `zh`, `iw` → `he`, `fil` → `tl`; null when ML Kit has no
/// model for it (Kyrgyz, Kazakh, Uzbek, Nepali, Serbian…).
String? mlKitCode(String raw) {
  var c = raw.trim().toLowerCase().split(RegExp('[-_]')).first;
  c = switch (c) {
    'nb' || 'nn' => 'no',
    'iw' => 'he',
    'fil' => 'tl',
    _ => c,
  };
  return _byCode.containsKey(c) ? c : null;
}

/// Owner 2026-10-20: translation on the phone instead of the paid Google
/// Translate. Free, offline after a one-time download of each language
/// (about 30 MB), the text never leaves the device.
class DeviceTranslator {
  DeviceTranslator({TranslationEngine? engine, bool? supported})
      : _engine = engine ?? MlKitTranslationEngine(),
        _supported = supported ?? _platformHasMlKit;

  final TranslationEngine _engine;
  final bool _supported;

  static bool get _platformHasMlKit =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  /// True on Android and iOS.
  bool get available => _supported;

  /// Whether [appLanguage] can be a target here.
  bool supportsTarget(String appLanguage) =>
      _supported && mlKitCode(appLanguage) != null;

  /// [text] in [appLanguage]. [onDownloading] fires once when a language
  /// model has to be fetched first.
  Future<String> translate(
    String text,
    String appLanguage, {
    VoidCallback? onDownloading,
  }) async {
    if (!_supported) {
      throw const DeviceTranslateException(DeviceTranslateFailure.unavailable);
    }
    final to = mlKitCode(appLanguage);
    if (to == null) {
      throw const DeviceTranslateException(
        DeviceTranslateFailure.targetUnsupported,
      );
    }
    try {
      final detected = await _engine.detect(text);
      if (detected == null) {
        throw const DeviceTranslateException(
          DeviceTranslateFailure.sourceUnknown,
        );
      }
      final from = mlKitCode(detected);
      if (from == null) {
        throw const DeviceTranslateException(
          DeviceTranslateFailure.sourceUnsupported,
        );
      }
      if (from == to) {
        throw const DeviceTranslateException(
          DeviceTranslateFailure.sameLanguage,
        );
      }
      var announced = false;
      for (final code in [from, to]) {
        if (await _engine.hasModel(code)) continue;
        // Owner 2026-10-20: ~30 MB per language, Wi-Fi only.
        if (!await _engine.onWifi()) {
          throw const DeviceTranslateException(DeviceTranslateFailure.wifi);
        }
        if (!announced) {
          announced = true;
          onDownloading?.call();
        }
        var got = false;
        try {
          got = await _engine.downloadModel(code);
        } on PlatformException {
          got = false;
        }
        if (!got) {
          throw const DeviceTranslateException(DeviceTranslateFailure.download);
        }
      }
      return await _engine.translate(text, from, to);
    } on DeviceTranslateException {
      rethrow;
    } on PlatformException {
      throw const DeviceTranslateException(DeviceTranslateFailure.failed);
    }
  }
}

final deviceTranslatorProvider = Provider<DeviceTranslator>(
  (ref) => DeviceTranslator(),
);
