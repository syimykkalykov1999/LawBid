import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Owner 2026-10-05: nothing may sit under the Android navigation bar.
void main() {
  late MediaQueryData seen;

  Widget app({
    EdgeInsets insets = EdgeInsets.zero,
    bool dark = false,
    FocusNode? field,
  }) {
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
                return Stack(
                  children: [
                    const SizedBox.expand(key: Key('page')),
                    if (field != null)
                      TextField(focusNode: field, autofocus: true),
                  ],
                );
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
    final field = FocusNode();
    addTearDown(field.dispose);
    await pump(
      tester,
      app(insets: const EdgeInsets.only(bottom: 300), field: field),
    );
    await tester.pump();
    expect(tester.getBottomLeft(find.byKey(const Key('page'))).dy, 800 - 300);
    debugDefaultTargetPlatformOverride = null;
  });

  testWidgets(
      'owner bug 2026-10-28: a keyboard height the phone keeps reporting '
      'after the field closed does not squash the app', (tester) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    final field = FocusNode();
    addTearDown(field.dispose);
    // Search open: keyboard up, the page ends above it.
    await pump(
      tester,
      app(insets: const EdgeInsets.only(bottom: 300), field: field),
    );
    await tester.pump();
    expect(tester.getBottomLeft(find.byKey(const Key('page'))).dy, 800 - 300);
    // Search closed (field unfocused) but the phone still reports the
    // keyboard: the page is full height again (above the nav bar).
    field.unfocus();
    await tester.pump();
    await tester.pump();
    expect(tester.getBottomLeft(find.byKey(const Key('page'))).dy, 800 - 48);
    // Another screen opened later with the stale inset: still full height.
    await pump(tester, app(insets: const EdgeInsets.only(bottom: 300)));
    await tester.pump();
    expect(tester.getBottomLeft(find.byKey(const Key('page'))).dy, 800 - 48);
    debugDefaultTargetPlatformOverride = null;
  });

  testWidgets('iOS: a stale keyboard inset is ignored too', (tester) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    await pump(tester, app(insets: const EdgeInsets.only(bottom: 300)));
    await tester.pump();
    expect(tester.getBottomLeft(find.byKey(const Key('page'))).dy, 800);
    expect(seen.padding.bottom, 0);
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

  testWidgets(
      'owner bug 2026-10-28: back from a step-up screen with the keyboard '
      'up leaves the parent screen full height', (tester) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    final navKey = GlobalKey<NavigatorState>();
    await pump(
      tester,
      MaterialApp(
        navigatorKey: navKey,
        theme: AppTheme.light(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            viewPadding: const EdgeInsets.only(bottom: 48),
            // The phone keeps reporting the keyboard the whole time.
            viewInsets: const EdgeInsets.only(bottom: 300),
          ),
          child: SystemNavBand(child: child!),
        ),
        home: Scaffold(
          body: ListView(
            key: const Key('settings'),
            children: const [SizedBox(height: 2000)],
          ),
        ),
      ),
    );
    unawaited(
      navKey.currentState!.push(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(
            body: TextField(autofocus: true, key: Key('code')),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('code')), findsOneWidget);
    navKey.currentState!.pop();
    await tester.pumpAndSettle();
    expect(
      tester.getSize(find.byKey(const Key('settings'))).height,
      800 - 48,
    );
    debugDefaultTargetPlatformOverride = null;
  });
}
