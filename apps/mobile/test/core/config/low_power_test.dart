import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/config/low_power.dart';
import 'package:lawbid/core/media/prefetch_policy.dart';
import 'package:lawbid/core/media/video_compression.dart';

void main() {
  setUp(ClientTuning.reset);
  tearDown(ClientTuning.reset);

  group('isLowPower', () {
    test('little charge off the charger', () {
      expect(isLowPower(level: 20, charging: false, saver: false), isTrue);
      expect(isLowPower(level: 21, charging: false, saver: false), isFalse);
    });

    test('on a charger it is not low, however little is left', () {
      expect(isLowPower(level: 3, charging: true, saver: false), isFalse);
    });

    test("the phone's battery saver counts at any charge", () {
      expect(isLowPower(level: 90, charging: false, saver: true), isTrue);
      expect(isLowPower(level: 90, charging: true, saver: true), isTrue);
    });
  });

  group('what goes gently', () {
    test('no reels are warmed ahead, and warm-up comes back after', () {
      expect(ClientTuning.videoPrefetchAhead, 3);
      ClientTuning.lowPower = true;
      expect(ClientTuning.videoPrefetchAhead, 0);
      expect(
        prefetchAllowed(
          dataSaver: false,
          ahead: ClientTuning.videoPrefetchAhead,
        ),
        isFalse,
      );
      ClientTuning.lowPower = false;
      expect(ClientTuning.videoPrefetchAhead, 3);
    });

    test('a clip up to 30 MB keeps its original, a bigger one is encoded', () {
      const limit = kLowPowerKeepOriginalBytes;
      expect(keepOriginalForPower(lowPower: true, bytes: limit), isTrue);
      expect(keepOriginalForPower(lowPower: true, bytes: limit + 1), isFalse);
      expect(keepOriginalForPower(lowPower: false, bytes: 1), isFalse);
    });

    test('the compressor returns the original without touching the plugin',
        () async {
      ClientTuning.lowPower = true;
      final out = await PluginVideoCompressor().compress(
        XFile.fromData(Uint8List(100), name: 'v.mp4'),
        limits: (maxHeight: 1080, frameRate: 30),
      );
      expect(out, isNull);
    });
  });

  test('the flag off: never low, and no battery call is made', () async {
    TestWidgetsFlutterBinding.ensureInitialized();
    LowPowerMonitor.instance.setEnabled(enabled: false);
    await LowPowerMonitor.instance.refresh();
    expect(ClientTuning.lowPower, isFalse);
  });

  test('a phone that does not answer counts as not low', () async {
    TestWidgetsFlutterBinding.ensureInitialized();
    ClientTuning.lowPower = true;
    LowPowerMonitor.instance.setEnabled(enabled: true);
    await LowPowerMonitor.instance.refresh();
    expect(ClientTuning.lowPower, isFalse);
    LowPowerMonitor.instance.setEnabled(enabled: false);
  });
}
