import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/application/image_edit.dart';
import 'package:lawbid/features/chat/presentation/image_crop_screen.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-22 (WhatsApp): crop before sending. A 200 x 100 picture;
/// the «1:1» chip frames a square, a corner drag resizes the frame, and
/// applying the edit gives a smaller JPEG.
Future<Uint8List> _png(int w, int h) async {
  final rec = ui.PictureRecorder();
  ui.Canvas(rec).drawRect(
    ui.Rect.fromLTWH(0, 0, w.toDouble(), h.toDouble()),
    ui.Paint()..color = const ui.Color(0xFF3366CC),
  );
  final image = await rec.endRecording().toImage(w, h);
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  return data!.buffer.asUint8List();
}

void main() {
  testWidgets('1:1 frames the biggest square, Done returns it', (tester) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final bytes = (await tester.runAsync(() => _png(200, 100)))!;
    ImageEdit? out;
    await tester.pumpWidget(
      ProviderScope(
        overrides: uxOverrides(),
        child: MaterialApp(
          theme: AppTheme.light(),
          home: Builder(
            builder: (context) => TextButton(
              onPressed: () async {
                out = await Navigator.of(context).push<ImageEdit>(
                  MaterialPageRoute(
                    builder: (_) => ImageCropScreen(bytes: bytes),
                  ),
                );
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pump();
    // The picture's size is read asynchronously.
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 200)),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('1:1'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('crop-done')));
    await tester.pumpAndSettle();
    final crop = out!.crop!;
    // 200 x 100 picture: a square is half the width, the full height.
    expect(crop.width, closeTo(0.5, 0.001));
    expect(crop.height, closeTo(1, 0.001));
    expect(out!.isIdentity, isFalse);
  });

  test('a crop gives a smaller JPEG, a turn swaps the sides', () async {
    final bytes = await _png(200, 100);
    final cropped = await applyImageEdit(
      bytes,
      const ImageEdit(crop: ui.Rect.fromLTRB(0, 0, 0.5, 1)),
    );
    expect(cropped.sublist(0, 2), [0xFF, 0xD8]);
    final size = await _sizeOf(cropped);
    expect((size.width, size.height), (100, 100));
    final turned = await applyImageEdit(bytes, const ImageEdit().turned());
    final t = await _sizeOf(turned);
    expect((t.width, t.height), (100, 200));
  });
}

Future<ui.Image> _sizeOf(Uint8List bytes) async {
  final codec = await ui.instantiateImageCodec(bytes);
  return (await codec.getNextFrame()).image;
}
