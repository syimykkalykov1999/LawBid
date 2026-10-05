import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Owner 2026-10-05: nothing may sit under the Android navigation bar.
void main() {
  late MediaQueryData seen;

  Widget app({EdgeInsets insets = EdgeInsets.zero, bool dark = false}) {
    return MaterialApp(
      theme: AppTheme.light(),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          viewPadding: const EdgeInsets.only(top: 24, bottom: 48),
          padding: EdgeInsets.only(
            top: 24,
            bottom: insets.bottom > 0 ? 0 : 48,
          ),
          viewInsets: insets,
        ),
        child: SystemNavBand(child: child!),
      ),
      home: Builder(
        builder: (context) {
          seen = MediaQuery.of(context);
          final body = Scaffold(
            body: Builder(
              builder: (context) {
                seen = MediaQuery.of(context);
                return const SizedBox.expand(key: Key('page'));
              },
            ),
          );
          return dark
              ? SystemNavBandColor(color: Colors.black, child: body)
              : body;
        },
      ),
    );
  }

  Future<void> pump(WidgetTester tester, Widget widget) async {
    tester.view
      ..physicalSize = const Size(400, 800)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(widget);
  }

  testWidgets('Android: page ends above the navigation bar', (tester) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    await pump(tester, app());
    expect(tester.getBottomLeft(find.byKey(const Key('page'))).dy, 800 - 48);
    expect(seen.padding.bottom, 0);
    expect(seen.viewPadding.bottom, 0);
    expect(seen.padding.top, 24);
    debugDefaultTargetPlatformOverride = null;
  });

  testWidgets(
      'Android: keyboard lifts the page only by what rises above '
      'the bar', (tester) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    await pump(tester, app(insets: const EdgeInsets.only(bottom: 300)));
    expect(tester.getBottomLeft(find.byKey(const Key('page'))).dy, 800 - 300);
    debugDefaultTargetPlatformOverride = null;
  });

  testWidgets('Android: dark page paints the strip dark', (tester) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    await pump(tester, app(dark: true));
    await tester.pump();
    final strip = tester.widget<ColoredBox>(
      find
          .descendant(
            of: find.byType(SystemNavBand),
            matching: find.byType(ColoredBox),
          )
          .last,
    );
    expect(strip.color, Colors.black);
    debugDefaultTargetPlatformOverride = null;
  });

  testWidgets('iOS keeps edge-to-edge', (tester) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    await pump(tester, app());
    expect(tester.getBottomLeft(find.byKey(const Key('page'))).dy, 800);
    debugDefaultTargetPlatformOverride = null;
  });
}
