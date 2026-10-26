import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';

/// Owner 2026-10-26 (smoothness): a picked photo shown as a small preview
/// (a composer thumbnail, a cover in a card) is decoded only as large as
/// the box needs, not at the camera's 12 MP. A 4000×3000 photo in a 44 pt
/// box took ~48 MB of memory and a long decode on the UI's raster thread;
/// now it is about 132×176 px.
///
/// The shorter side of the decoded picture is [minSide] pixels (never
/// upscaled), so the picture still covers its box both ways, whatever its
/// shape or EXIF rotation: [BoxFit.cover] and [BoxFit.contain] look as
/// before.
@immutable
class ThumbMemoryImage extends MemoryImage {
  const ThumbMemoryImage(super.bytes, {required this.minSide});

  /// The decoded picture's shorter side, in physical pixels.
  final int minSide;

  @override
  ImageStreamCompleter loadImage(
    MemoryImage key,
    ImageDecoderCallback decode,
  ) =>
      super.loadImage(
        key,
        (
          ui.ImmutableBuffer buffer, {
          ui.TargetImageSizeCallback? getTargetSize,
        }) =>
            decode(buffer, getTargetSize: thumbTargetSize(minSide)),
      );

  @override
  bool operator ==(Object other) =>
      other is ThumbMemoryImage && super == other && other.minSide == minSide;

  @override
  int get hashCode => Object.hash(super.hashCode, minSide);
}

/// The decode size that makes the shorter side [minSide] pixels (the other
/// side follows the picture's shape); pictures already that small stay as
/// they are.
ui.TargetImageSizeCallback thumbTargetSize(int minSide) => (w, h) {
      if (math.min(w, h) <= minSide) return const ui.TargetImageSize();
      return w <= h
          ? ui.TargetImageSize(width: minSide)
          : ui.TargetImageSize(height: minSide);
    };

/// [bytes] for a box whose longer side is [maxSide] logical pixels.
ImageProvider thumbImage(
  BuildContext context,
  Uint8List bytes, {
  required double maxSide,
}) =>
    ThumbMemoryImage(
      bytes,
      minSide: math.max(
        1,
        (maxSide * MediaQuery.devicePixelRatioOf(context)).ceil(),
      ),
    );
