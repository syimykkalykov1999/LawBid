import 'package:flutter_test/flutter_test.dart';

import 'helpers/golden_platform.dart';

void main() {
  test('without GOLDEN_PLATFORM the macOS goldens stay in use', () {
    // The regular `flutter test` run (no define) keeps the old PNGs and
    // their tolerance; tool/ci/golden_linux.sh passes the define.
    expect(goldenPlatform, isEmpty);
    expect(platformGoldens, isFalse);
  });
}
