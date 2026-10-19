import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/social/presentation/screens/photo_crop_screen.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

/// Owner 2026-10-19: every picked photo (all nine) is framed by hand —
/// moved with a finger, zoomed — with an «original / square» switch for
/// the set, as in Instagram; the post gets exactly that frame.
Future<Uint8List> _png(int w, int h) async {
  final rec = ui.PictureRecorder();
  Canvas(rec).drawRect(
    Rect.fromLTWH(0, 0, w.toDouble(), h.toDouble()),
    Paint()..color = const Color(0xFF3377AA),
  );
  final img = await rec.endRecording().toImage(w, h);
  final data = await img.toByteData(format: ui.ImageByteFormat.png);
  return data!.buffer.asUint8List();
}

Future<Size> _size(Uint8List bytes) async {
  final codec = await ui.instantiateImageCodec(bytes);
  final f = await codec.getNextFrame();
  return Size(f.image.width.toDouble(), f.image.height.toDouble());
}

void main() {
  late List<Uint8List> photos;
  setUpAll(() async {
    photos = [await _png(900, 1600), await _png(1600, 900)];
  });

  Future<FramedPhotos?> run(
    WidgetTester tester,
    Future<void> Function() act, {
    List<PhotoFraming>? framings,
    PhotoFrame frame = PhotoFrame.original,
    Set<int>? fresh,
  }) async {
    useNarrowPhone(tester);
    FramedPhotos? result;
    await tester.pumpWidget(
      uxApp(
        Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () async => result = await PhotoCropScreen.open(
                  context,
                  photos: photos,
                  framings: framings,
                  frame: frame,
                  fresh: fresh,
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
        theme: AppTheme.dark(),
        size: narrowPhone,
        disableAnimations: true,
        overrides: uxOverrides(),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    // Decoding runs outside the fake clock.
    await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 200)));
    await tester.pump();
    expect(tester.takeException(), isNull);
    await act();
    await tester.runAsync(() async {
      await tester.tap(find.byKey(const ValueKey('photo-crop-done')));
      for (var i = 0; i < 20 && result == null; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 100));
        await tester.pump();
      }
    });
    await tester.pumpAndSettle();
    return result;
  }

  testWidgets('a tall photo keeps 4:5 at most; square makes every one 1:1',
      (tester) async {
    final original = await run(tester, () async {});
    expect(original, isNotNull);
    expect(original!.frame, PhotoFrame.original);
    final first = await tester.runAsync(() => _size(original.photos[0]!));
    expect(first!.width / first.height, closeTo(0.8, 0.01));
    expect(first.width, lessThanOrEqualTo(1080));

    final square = await run(tester, () async {
      await tester.tap(find.byKey(const ValueKey('photo-crop-switch')));
      await tester.pump();
    });
    expect(square!.frame, PhotoFrame.square);
    for (final p in square.photos) {
      final s = await tester.runAsync(() => _size(p!));
      expect(s!.width, s.height);
    }
  });

  testWidgets('each photo moves on its own; untouched ones keep their upload',
      (tester) async {
    final r = await run(
      tester,
      () async {
        await tester.tap(find.byKey(const ValueKey('photo-crop-thumb-1')));
        await tester.pump();
        await tester.drag(
          find.byKey(const ValueKey('photo-crop-frame')),
          const Offset(-80, 0),
        );
        await tester.pump();
      },
      framings: const [PhotoFraming(), PhotoFraming()],
      fresh: const {},
    );
    expect(r, isNotNull);
    expect(r!.photos[0], isNull, reason: 'not touched: kept as uploaded');
    expect(r.photos[1], isNotNull, reason: 'moved: cut again');
    expect(r.framings[1].dx, lessThan(0));
    expect(r.framings[0], const PhotoFraming());
  });
}
