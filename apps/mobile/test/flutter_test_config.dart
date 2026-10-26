import 'dart:async';

import 'package:flutter/foundation.dart';

import 'package:flutter_test/flutter_test.dart';
import 'package:golden_toolkit/golden_toolkit.dart';

/// Golden PNGs are rendered on the owner's Mac; the CI runner is another
/// macOS version, and text / anti-aliasing differ by a fraction of a percent
/// between them (107 goldens were red on main for that reason alone). Up to
/// [_tolerance] of the pixels may differ; a real layout or colour change
/// moves far more, and overflow has its own tests.
const _tolerance = 0.02;

class _TolerantComparator extends LocalFileComparator {
  _TolerantComparator(super.testFile);

  @override
  Future<bool> compare(Uint8List imageBytes, Uri golden) async {
    final result = await GoldenFileComparator.compareLists(
      imageBytes,
      await getGoldenBytes(golden),
    );
    if (!result.passed && result.diffPercent <= _tolerance) return true;
    if (!result.passed) {
      final error = await generateFailureOutput(result, golden, basedir);
      throw FlutterError(error);
    }
    return true;
  }
}

/// Loads LawBid's real bundled fonts (Source Serif 4 / Inter) into every
/// test in this directory tree before it runs — without this, `flutter test`
/// substitutes a placeholder font and golden images would not reflect the
/// actual approved typography (file 07 §3). See golden_toolkit justification
/// in docs/CHANGELOG.md stage 1.5.
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  await loadAppFonts();
  final base = goldenFileComparator;
  if (base is LocalFileComparator) {
    goldenFileComparator =
        _TolerantComparator(base.basedir.resolve('golden_test.dart'));
  }
  return testMain();
}
