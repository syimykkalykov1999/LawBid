import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/data/voice_files.dart';

/// Owner 2026-10-15: your own voice note plays from the recording, not
/// from a download after the server has it.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory tmp;

  setUp(() {
    tmp = Directory.systemTemp.createTempSync('voice_cache_');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (call) async => call.method == 'getTemporaryDirectory' ? tmp.path : null,
    );
  });

  tearDown(() => tmp.deleteSync(recursive: true));

  test('the recording becomes the cached copy of the sent message', () async {
    final rec = File('${tmp.path}/voice_1.m4a')..writeAsBytesSync([1, 2, 3]);
    await adoptVoiceFileAsCache(rec.path, 'm-42');
    final cached = File((await voiceCachePath('m-42'))!);
    expect(cached.existsSync(), isTrue);
    expect(cached.readAsBytesSync(), [1, 2, 3]);
    expect(rec.existsSync(), isFalse);
  });

  test('a missing recording or no path does nothing', () async {
    await adoptVoiceFileAsCache(null, 'm-1');
    await adoptVoiceFileAsCache('${tmp.path}/nope.m4a', 'm-2');
    expect(File((await voiceCachePath('m-2'))!).existsSync(), isFalse);
  });
}
