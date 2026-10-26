import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/reels/domain/reel_cut.dart';
import 'package:lawbid/features/reels/presentation/video_editor_screen.dart';

import '../helpers/long_locale.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-15: the «Video» editor fits at 360 dp, font 1.3, on both
/// tabs, in a light and a dark theme (no player or frames in a test).
void main() {
  for (final scale in [1.0, 1.3]) {
    for (final tab in [0, 1]) {
      for (final dark in [false, true]) {
        testWidgets('video editor, x$scale, tab $tab, dark=$dark',
            (tester) async {
          useNarrowPhone(tester);
          await tester.pumpWidget(
            uxApp(
              VideoEditorScreen(
                file: XFile('/none.mp4'),
                cut: const ReelCut(
                  totalMs: 95000,
                  startMs: 5000,
                  endMs: 65000,
                  coverMs: 24000,
                ),
                maxMs: 180000,
                initialTab: tab,
              ),
              theme: dark ? AppTheme.dark() : AppTheme.light(),
              textScale: scale,
            ),
          );
          await tester.pump(const Duration(milliseconds: 400));
          expect(tester.takeException(), isNull);
        });
      }
    }
  }
}
