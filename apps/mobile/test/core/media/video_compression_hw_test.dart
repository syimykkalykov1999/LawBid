import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/config/client_tuning.dart';
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
    expect(sent?.arguments, {
      'path': source.path,
      'maxShortSide': 720,
      'frameRate': 30,
    });
    expect(out?.path, encoded.path);
    expect(out?.mimeType, 'video/mp4');
    expect(fellBack, isFalse);
  });

  test('Android: progress from the encoder reaches the caller', () async {
    final source = file('in.mp4', 1000);
    final encoded = file('out.mp4', 400);
    messenger.setMockMethodCallHandler(channel, (call) async {
      // The encoder reports 0.5 while it works.
      await messenger.handlePlatformMessage(
        channel.name,
        channel.codec.encodeMethodCall(const MethodCall('progress', 0.5)),
        (_) {},
      );
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

  test('Android: cancel reaches the Media3 encoder', () async {
    final calls = <String>[];
    messenger.setMockMethodCallHandler(channel, (call) async {
      calls.add(call.method);
      return null;
    });
    await PluginVideoCompressor(platform: TargetPlatform.android).cancel();
    expect(calls, ['cancel']);
  });
}
