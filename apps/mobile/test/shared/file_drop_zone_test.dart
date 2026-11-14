import 'dart:io';
import 'dart:ui' as ui;

import 'package:desktop_drop/desktop_drop.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/default_feature_flags.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/features/cases/application/case_media_picker.dart';
import 'package:lawbid/shared/presentation/file_drop_zone.dart';

import '../helpers/ux_harness.dart';

const _channel = MethodChannel('desktop_drop');

class _Flags extends FeatureFlagsController {
  _Flags({required this.on});

  final bool on;

  @override
  FeatureFlagsState build() => FeatureFlagsState(
        flags: {...defaultFeatureFlags}..['web_file_drop'] = on,
        appConfig: const {},
      );

  @override
  Future<void> refreshInBackground({
    String? knownVersion,
    Map<String, bool>? flags,
  }) async {}
}

Future<void> _event(String method, Object? args) =>
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .handlePlatformMessage(
      'desktop_drop',
      _channel.codec.encodeMethodCall(MethodCall(method, args)),
      (_) {},
    );

void main() {
  tearDown(() => FileDropZone.debugAssumeWeb = false);

  group('FileDropZone', () {
    Future<List<XFile>> pump(
      WidgetTester tester, {
      required bool web,
      required bool flag,
      bool enabled = true,
    }) async {
      FileDropZone.debugAssumeWeb = web;
      final got = <XFile>[];
      await tester.pumpWidget(
        uxApp(
          FileDropZone(
            enabled: enabled,
            onFiles: got.addAll,
            child: const SizedBox.expand(key: ValueKey('page')),
          ),
          size: const Size(800, 600),
          theme: AppTheme.light(),
          overrides: uxOverrides(
            extra: [
              featureFlagsControllerProvider.overrideWith(
                () => _Flags(on: flag),
              ),
            ],
          ),
        ),
      );
      await tester.pump();
      return got;
    }

    testWidgets('on a phone the page stays as it is', (tester) async {
      await pump(tester, web: false, flag: true);
      expect(find.byType(DropTarget), findsNothing);
      expect(find.byKey(const ValueKey('page')), findsOneWidget);
    });

    testWidgets('the switch off: no drop target on the website',
        (tester) async {
      await pump(tester, web: true, flag: false);
      expect(find.byType(DropTarget), findsNothing);
    });

    testWidgets('a drag shows the hint, a drop hands over the files',
        (tester) async {
      final got = await pump(tester, web: true, flag: true);
      expect(find.byType(DropTarget), findsOneWidget);

      await _event('entered', [100.0, 100.0]);
      await tester.pump();
      expect(find.byKey(const ValueKey('file-drop-hint')), findsOneWidget);

      await _event('exited', null);
      await tester.pump();
      expect(find.byKey(const ValueKey('file-drop-hint')), findsNothing);

      await _event('entered', [100.0, 100.0]);
      await _event('performOperation', ['/tmp/report.pdf']);
      await tester.pump();
      expect(find.byKey(const ValueKey('file-drop-hint')), findsNothing);
      expect(got.single.path, '/tmp/report.pdf');
    });

    testWidgets('disabled: nothing is taken', (tester) async {
      final got = await pump(tester, web: true, flag: true, enabled: false);
      await _event('entered', [100.0, 100.0]);
      await _event('performOperation', ['/tmp/report.pdf']);
      await tester.pump();
      expect(got, isEmpty);
    });
  });

  test('a case takes a photo without a name, a document with its own',
      () async {
    final dir = Directory.systemTemp.createTempSync('dropped');
    addTearDown(() => dir.deleteSync(recursive: true));
    XFile file(String name, int size) {
      final f = File('${dir.path}/$name')
        ..writeAsBytesSync(List<int>.filled(size, 1));
      return XFile(f.path);
    }

    const limits = PlaceUploadLimits(
      maxPhotos: 9,
      maxFiles: 5,
      fileMb: 1,
      totalMb: 10,
      formats: {'pdf', 'jpg'},
    );
    final out = await droppedCaseFiles(
      [
        file('a.jpg', 10),
        file('b.pdf', 10),
        file('c.exe', 10),
        file('d.pdf', 2 * 1024 * 1024),
      ],
      limits,
    );
    expect(out.map((f) => f.name), [null, 'b.pdf']);
  });

  test('a dropped photo is shrunk to the long side, a small one stays',
      () async {
    final recorder = ui.PictureRecorder();
    ui.Canvas(recorder).drawRect(
      const Rect.fromLTWH(0, 0, 400, 200),
      ui.Paint()..color = const Color(0xFF336699),
    );
    final image = await recorder.endRecording().toImage(400, 200);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    final bytes = data!.buffer.asUint8List();

    expect(
      identical(await shrinkDroppedPhoto(bytes, 400, quality: 90), bytes),
      isTrue,
    );
    final small = await shrinkDroppedPhoto(bytes, 100, quality: 90);
    final codec = await ui.instantiateImageCodec(small);
    final frame = await codec.getNextFrame();
    expect(frame.image.width, 100);
    expect(frame.image.height, 50);
    expect(
      identical(
        await shrinkDroppedPhoto(Uint8List(4), 100, quality: 90),
        small,
      ),
      isFalse,
      reason: 'what cannot be decoded stays as it is',
    );
  });

  test('a photo is told by its type or its name', () {
    expect(isDroppedPhoto(XFile('/x/a.HEIC')), isTrue);
    expect(isDroppedPhoto(XFile('/x/a', mimeType: 'image/png')), isTrue);
    expect(isDroppedPhoto(XFile('/x/a.pdf')), isFalse);
  });
}
