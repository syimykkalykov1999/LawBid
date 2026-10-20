import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/translation/data/device_translator.dart';

class _Engine implements TranslationEngine {
  _Engine({this.detected = 'ru', this.have = const {}, this.downloads = true});

  final String? detected;
  final Set<String> have;
  final bool downloads;
  final fetched = <String>[];

  @override
  Future<String?> detect(String text) async => detected;

  @override
  Future<bool> hasModel(String code) async =>
      have.contains(code) || fetched.contains(code);

  @override
  Future<bool> downloadModel(String code) async {
    if (downloads) fetched.add(code);
    return downloads;
  }

  @override
  Future<String> translate(String text, String from, String to) async =>
      '$from>$to:$text';
}

DeviceTranslator _on(_Engine e) => DeviceTranslator(engine: e, supported: true);

Future<DeviceTranslateFailure?> _fails(Future<String> run) async {
  try {
    await run;
    return null;
  } on DeviceTranslateException catch (e) {
    return e.reason;
  }
}

void main() {
  group('mlKitCode', () {
    test('maps the app codes to ML Kit', () {
      expect(mlKitCode('en'), 'en');
      expect(mlKitCode('nb'), 'no');
      expect(mlKitCode('zh-tw'), 'zh');
      expect(mlKitCode('es-MX'), 'es');
      expect(mlKitCode('tl'), 'tl');
    });

    test('languages without a model are null', () {
      for (final c in ['ky', 'kk', 'uz', 'ne', 'sr', 'am']) {
        expect(mlKitCode(c), isNull, reason: c);
      }
    });
  });

  group('DeviceTranslator', () {
    test('translates and downloads missing models once', () async {
      final engine = _Engine();
      final out = await _on(engine).translate('привет', 'en');
      expect(out, 'ru>en:привет');
      expect(engine.fetched, ['ru', 'en']);
    });

    test('announces the download only when a model is missing', () async {
      var calls = 0;
      await _on(_Engine(have: {'ru', 'en'}))
          .translate('привет', 'en', onDownloading: () => calls++);
      expect(calls, 0);
      await _on(_Engine(have: {'ru'}))
          .translate('привет', 'en', onDownloading: () => calls++);
      expect(calls, 1);
    });

    test('same language, unknown and unsupported languages', () async {
      expect(
        await _fails(_on(_Engine(detected: 'en')).translate('hi', 'en')),
        DeviceTranslateFailure.sameLanguage,
      );
      expect(
        await _fails(_on(_Engine(detected: null)).translate('12', 'en')),
        DeviceTranslateFailure.sourceUnknown,
      );
      expect(
        await _fails(_on(_Engine(detected: 'ky')).translate('салам', 'en')),
        DeviceTranslateFailure.sourceUnsupported,
      );
      expect(
        await _fails(_on(_Engine()).translate('привет', 'ky')),
        DeviceTranslateFailure.targetUnsupported,
      );
    });

    test('a model that does not arrive is a download failure', () async {
      expect(
        await _fails(_on(_Engine(downloads: false)).translate('привет', 'en')),
        DeviceTranslateFailure.download,
      );
    });

    test('the web translates nothing and says so', () async {
      final web = DeviceTranslator(engine: _Engine(), supported: false);
      expect(web.available, isFalse);
      expect(web.supportsTarget('en'), isFalse);
      expect(
        await _fails(web.translate('привет', 'en')),
        DeviceTranslateFailure.unavailable,
      );
    });
  });
}
