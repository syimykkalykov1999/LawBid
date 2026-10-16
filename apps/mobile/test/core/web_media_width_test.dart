import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';
import 'package:lawbid/core/navigation/shell/web_media_width.dart';
import 'package:lawbid/features/social/presentation/widgets/post_grid_tile.dart';

/// Owner 2026-10-16: on the web a post is as wide as Instagram's (470 px),
/// a brief as Threads' column (640 px), a reel is a 9:16 player as tall as
/// the window (at most 420 px wide), the profile grid is 3:4 with a 1 px gap.
void main() {
  tearDown(() => adaptiveShellOverride = null);

  Future<Size> sizeOf(
    WidgetTester tester,
    Widget child, {
    double width = 680,
    double height = 900,
  }) async {
    tester.view
      ..physicalSize = Size(width, height)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      Directionality(
        textDirection: TextDirection.ltr,
        child: SizedBox(width: width, height: height, child: child),
      ),
    );
    return tester.getSize(find.byKey(const ValueKey('probe')));
  }

  const probe = SizedBox(key: ValueKey('probe'), height: 50);

  testWidgets('a post is 470 px wide in the 680 px web column', (tester) async {
    adaptiveShellOverride = true;
    final s = await sizeOf(
      tester,
      const WebMediaWidth(maxWidth: kWebPostMaxWidth, child: probe),
    );
    expect(s.width, 470);
  });

  testWidgets('a brief is as wide as a post (470 px)', (tester) async {
    adaptiveShellOverride = true;
    final s = await sizeOf(
      tester,
      const WebMediaWidth(maxWidth: kWebBriefMaxWidth, child: probe),
    );
    expect(s.width, 470);
  });

  testWidgets('phones and the narrow web column keep the full width',
      (tester) async {
    adaptiveShellOverride = false;
    var s = await sizeOf(
      tester,
      const WebMediaWidth(maxWidth: kWebPostMaxWidth, child: probe),
      width: 390,
    );
    expect(s.width, 390);
    adaptiveShellOverride = true;
    s = await sizeOf(
      tester,
      const WebMediaWidth(maxWidth: kWebPostMaxWidth, child: probe),
      width: 390,
    );
    expect(s.width, 390);
  });

  testWidgets('a reel card is 9:16, the window height minus 16 px each side',
      (tester) async {
    adaptiveShellOverride = true;
    final s = await sizeOf(
      tester,
      const WebReelFrame(child: SizedBox.expand(key: ValueKey('probe'))),
      width: 1280,
    );
    expect(s.height, 868);
    expect(s.width, closeTo(868 * 9 / 16, 0.5));
  });

  test('the profile grid is three 3:4 tiles with a 1 px gap on the web', () {
    adaptiveShellOverride = true;
    final d =
        profileGridDelegate() as SliverGridDelegateWithFixedCrossAxisCount;
    expect(d.crossAxisCount, 3);
    expect(d.crossAxisSpacing, 1);
    expect(d.mainAxisSpacing, 1);
    expect(d.childAspectRatio, 0.75);
    adaptiveShellOverride = false;
    expect(profileGridDelegate(), same(kPostGridDelegate));
  });
}
