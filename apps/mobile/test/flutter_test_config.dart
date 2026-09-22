import 'dart:async';

import 'package:golden_toolkit/golden_toolkit.dart';

/// Loads LawBid's real bundled fonts (Source Serif 4 / Inter) into every
/// test in this directory tree before it runs — without this, `flutter test`
/// substitutes a placeholder font and golden images would not reflect the
/// actual approved typography (file 07 §3). See golden_toolkit justification
/// in docs/CHANGELOG.md stage 1.5.
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  await loadAppFonts();
  return testMain();
}
