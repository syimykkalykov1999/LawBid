import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

/// Platform goldens, the layout alchemist (Betterment, MIT) uses: one set of
/// PNGs per host OS, side by side, so a Linux runner never compares against
/// pictures that macOS rendered (text rasterises differently on each OS).
///
/// `flutter test --dart-define=GOLDEN_PLATFORM=linux` reads and writes
/// `goldens/linux/<name>.png` next to the macOS `goldens/<name>.png`, and
/// compares exactly (no tolerance): both sides are rendered by the same
/// engine on the same OS, so any differing pixel is a real change. Without
/// the define nothing changes: the macOS PNGs and their tolerance stay.
const goldenPlatform = String.fromEnvironment('GOLDEN_PLATFORM');

/// True when this run uses the per-platform golden directory.
bool get platformGoldens => goldenPlatform.isNotEmpty;

/// `goldens/a.png` → `goldens/linux/a.png` (the golden's own directory gets
/// a `<platform>/` subdirectory).
Uri platformGoldenUri(Uri golden) =>
    golden.resolve('$goldenPlatform/${golden.pathSegments.last}');

/// Exact comparison against the per-platform PNG.
class PlatformGoldenComparator extends LocalFileComparator {
  PlatformGoldenComparator(super.testFile) {
    if (goldenPlatform != Platform.operatingSystem) {
      throw StateError(
        'GOLDEN_PLATFORM=$goldenPlatform, but this host is '
        '${Platform.operatingSystem}: platform goldens are only valid on '
        'the OS that rendered them.',
      );
    }
  }

  @override
  Future<bool> compare(Uint8List imageBytes, Uri golden) =>
      super.compare(imageBytes, platformGoldenUri(golden));

  @override
  Future<void> update(Uri golden, Uint8List imageBytes) =>
      super.update(platformGoldenUri(golden), imageBytes);
}
