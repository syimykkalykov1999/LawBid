import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';
import 'package:lawbid/core/media/video_compression.dart';

/// Owner row 42 (13.11): Android re-encodes on Media3 Transformer
/// (`lawbid/video_encoder`); the old plugin runs only when that fails.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('lawbid/video_encoder');
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  const limits = (maxHeight: 720, frameRate: 30);
  late Directory dir;

  setUp(() {
    ClientTuning.lowPower = false;
    dir = Directory.systemTemp.createTempSync('hw_video_');
  });
  tearDown(() {
    messenger.setMockMethodCallHandler(channel, null);
    dir.deleteSync(recursive: true);
  });

  XFile file(String name, int bytes) {
    final f = File('${dir.path}/$name')..writeAsBytesSync(Uint8List(bytes));
    return XFile(f.path);
  }

  test('Android: Media3 gets the admin limits and its smaller file is used',
      () async {
    final source = file('in.mp4', 1000);
    final encoded = file('out.mp4', 400);
    MethodCall? sent;
    messenger.setMockMethodCallHandler(channel, (call) async {
      sent = call;
      return encoded.path;
    });
    var fellBack = false;
    final out = await PluginVideoCompressor(
      platform: TargetPlatform.android,
      fallback: (_, __) async {
        fellBack = true;
        return null;
      },
    ).compress(source, limits: limits);
    expect(sent?.method, 'compress');
    final args = (sent?.arguments as Map).cast<String, Object?>();
    expect(args['path'], source.path);
    expect(args['maxShortSide'], 720);
    expect(args['frameRate'], 30);
    // The admin's 720p rung (default 2000 kbit/s).
    expect(args['bitrateKbps'], 2000);
    expect(args['id'], isA<String>());
    expect(out?.path, encoded.path);
    expect(out?.mimeType, 'video/mp4');
    expect(fellBack, isFalse);
  });

  test('Android: progress from the encoder reaches the caller', () async {
    final source = file('in.mp4', 1000);
    final encoded = file('out.mp4', 400);
    messenger.setMockMethodCallHandler(channel, (call) async {
      final id = (call.arguments as Map)['id'];
      // The encoder reports 0.5 for this video, 0.9 for another one.
      for (final m in [
        {'id': id, 'progress': 0.5},
        {'id': 'other', 'progress': 0.9},
      ]) {
        await messenger.handlePlatformMessage(
          channel.name,
          channel.codec.encodeMethodCall(MethodCall('progress', m)),
          (_) {},
        );
      }
      return encoded.path;
    });
    final seen = <double>[];
    await PluginVideoCompressor(platform: TargetPlatform.android)
        .compress(source, limits: limits, onProgress: seen.add);
    expect(seen, [0.5]);
  });

  test('Android: a Media3 failure falls back to the plugin', () async {
    final source = file('in.mp4', 1000);
    messenger.setMockMethodCallHandler(channel, (call) async {
      throw PlatformException(code: 'failed');
    });
    var fellBack = false;
    await PluginVideoCompressor(
      platform: TargetPlatform.android,
      fallback: (_, __) async {
        fellBack = true;
        return null;
      },
    ).compress(source, limits: limits);
    expect(fellBack, isTrue);
  });

  test('Android: a result not smaller keeps the original, no second encode',
      () async {
    final source = file('in.mp4', 1000);
    final encoded = file('out.mp4', 1000);
    messenger.setMockMethodCallHandler(channel, (call) async => encoded.path);
    var fellBack = false;
    final out = await PluginVideoCompressor(
      platform: TargetPlatform.android,
      fallback: (_, __) async {
        fellBack = true;
        return null;
      },
    ).compress(source, limits: limits);
    expect(out, isNull);
    expect(fellBack, isFalse);
    // The rejected temp file is deleted, the source stays.
    expect(File(encoded.path).existsSync(), isFalse);
    expect(File(source.path).existsSync(), isTrue);
  });

  test('Android: cancelled (null from the encoder) keeps the original',
      () async {
    final source = file('in.mp4', 1000);
    messenger.setMockMethodCallHandler(channel, (call) async => null);
    var fellBack = false;
    final out = await PluginVideoCompressor(
      platform: TargetPlatform.android,
      fallback: (_, __) async {
        fellBack = true;
        return null;
      },
    ).compress(source, limits: limits);
    expect(out, isNull);
    expect(fellBack, isFalse);
  });

  test('iOS: Media3 is never asked, the plugin path runs', () async {
    final source = file('in.mp4', 1000);
    var asked = false;
    messenger.setMockMethodCallHandler(channel, (call) async {
      asked = true;
      return null;
    });
    var fellBack = false;
    await PluginVideoCompressor(
      platform: TargetPlatform.iOS,
      fallback: (_, __) async {
        fellBack = true;
        return null;
      },
    ).compress(source, limits: limits);
    expect(asked, isFalse);
    expect(fellBack, isTrue);
  });

  test('Android: cancel reaches the Media3 encoder for its own video',
      () async {
    final source = file('in.mp4', 1000);
    final calls = <MethodCall>[];
    final c = PluginVideoCompressor(platform: TargetPlatform.android);
    final started = Completer<void>();
    final answer = Completer<String?>();
    messenger.setMockMethodCallHandler(channel, (call) async {
      calls.add(call);
      if (call.method == 'compress') {
        started.complete();
        return answer.future;
      }
      if (call.method == 'cancel') answer.complete(null);
      return null;
    });
    final pending = c.compress(source, limits: limits);
    await started.future;
    await c.cancel();
    expect(await pending, isNull);
    final id = (calls.first.arguments as Map)['id'];
    expect(calls.last.method, 'cancel');
    expect(calls.last.arguments, {'id': id});
  });

  test('Android: two videos at once both go to Media3, each its own progress',
      () async {
    final a = file('a.mp4', 1000);
    final b = file('b.mp4', 1000);
    final outA = file('oa.mp4', 300);
    final outB = file('ob.mp4', 300);
    final ids = <String, String>{};
    messenger.setMockMethodCallHandler(channel, (call) async {
      final m = (call.arguments as Map).cast<String, Object?>();
      final id = m['id']! as String;
      ids[m['path']! as String] = id;
      await messenger.handlePlatformMessage(
        channel.name,
        channel.codec.encodeMethodCall(
          MethodCall('progress', {'id': id, 'progress': 0.25}),
        ),
        (_) {},
      );
      return m['path'] == a.path ? outA.path : outB.path;
    });
    var fellBack = false;
    final c = PluginVideoCompressor(
      platform: TargetPlatform.android,
      fallback: (_, __) async {
        fellBack = true;
        return null;
      },
    );
    final seenA = <double>[];
    final seenB = <double>[];
    final r = await Future.wait([
      c.compress(a, limits: limits, onProgress: seenA.add),
      c.compress(b, limits: limits, onProgress: seenB.add),
    ]);
    expect(r[0]?.path, outA.path);
    expect(r[1]?.path, outB.path);
    expect(ids[a.path], isNot(ids[b.path]));
    expect(seenA, [0.25]);
    expect(seenB, [0.25]);
    expect(fellBack, isFalse);
  });

  group('bitrate ladder (admin)', () {
    FeatureFlagsState flags(Map<String, String> c) =>
        FeatureFlagsState(flags: const {}, appConfig: c);

    test('defaults 4500 / 2000 / 1200 kbit/s, admin values within bounds', () {
      expect(
        videoBitrateLadderOf(flags(const {})),
        (kbps1080: 4500, kbps720: 2000, kbps540: 1200),
      );
      expect(
        videoBitrateLadderOf(
          flags(const {
            'media.video_bitrate_1080_kbps': '6000',
            'media.video_bitrate_720_kbps': '10',
            'media.video_bitrate_540_kbps': '999999',
          }),
        ),
        (kbps1080: 6000, kbps720: 300, kbps540: 50000),
      );
    });

    test('rung by height; 4K grows with pixels; 60 fps doubles', () {
      const l = (kbps1080: 4500, kbps720: 2000, kbps540: 1200);
      expect(videoBitrateKbpsFor((maxHeight: 1080, frameRate: 30), l), 4500);
      expect(videoBitrateKbpsFor((maxHeight: 720, frameRate: 30), l), 2000);
      expect(videoBitrateKbpsFor((maxHeight: 540, frameRate: 24), l), 1200);
      expect(videoBitrateKbpsFor((maxHeight: 2160, frameRate: 30), l), 18000);
      expect(videoBitrateKbpsFor((maxHeight: 1080, frameRate: 60), l), 9000);
    });
  });
}
