import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/social/presentation/screens/create_post_screen.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

/// Owner 2026-10-18: Gallery / Camera live in a fixed row below the photo
/// strip; the strip scrolls alone. The topic field explains it is not a case.
void main() {
  Future<void> open(WidgetTester tester, int photos) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        CreatePostScreen(debugPhotoCount: photos),
        theme: AppTheme.of(AppThemeId.values.first),
        size: narrowPhone,
        disableAnimations: true,
        overrides: uxOverrides(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
  }

  final gallery = find.byKey(const ValueKey('post-add-gallery'));
  final camera = find.byKey(const ValueKey('post-add-camera'));
  final strip = find.byKey(const ValueKey('post-photo-strip'));

  testWidgets('no photos: only the buttons row, no strip', (tester) async {
    await open(tester, 0);
    expect(strip, findsNothing);
    expect(gallery, findsOneWidget);
    expect(camera, findsOneWidget);
  });

  testWidgets('buttons sit below the strip and stay put when it scrolls', (
    tester,
  ) async {
    await open(tester, 8);
    expect(strip, findsOneWidget);
    expect(
      find.descendant(of: strip, matching: gallery),
      findsNothing,
    );
    expect(
      find.descendant(of: strip, matching: camera),
      findsNothing,
    );
    final before = tester.getTopLeft(gallery);
    expect(before.dy, greaterThan(tester.getBottomLeft(strip).dy - 1));
    expect(
      tester.getSize(gallery).width,
      closeTo(tester.getSize(camera).width, 0.5),
    );
    await tester.drag(strip, const Offset(-300, 0));
    await tester.pump();
    expect(tester.getTopLeft(gallery), before);
  });

  testWidgets('buttons are disabled at the maximum', (tester) async {
    await open(tester, 9);
    expect(gallery, findsOneWidget);
    final p = tester.widget<AppPressable>(
      find.descendant(of: gallery, matching: find.byType(AppPressable)),
    );
    expect(p.onTap, isNull);
    expect(find.textContaining('9 / 9'), findsOneWidget);
  });

  testWidgets('topic hint is shown', (tester) async {
    await open(tester, 0);
    expect(find.byKey(const ValueKey('post-topic-hint')), findsOneWidget);
  });
}
