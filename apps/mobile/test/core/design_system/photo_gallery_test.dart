import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_avatar.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-07: a profile photo opens full screen; pinch / double tap
/// zooms, a swipe down closes.
void main() {
  setUp(() {
    debugGalleryImage = (url) => ColoredBox(
          key: ValueKey(url),
          color: Colors.blueGrey,
        );
  });
  tearDown(() => debugGalleryImage = null);

  Future<void> pump(WidgetTester t, {String? url}) => t.pumpWidget(
        uxApp(
          Scaffold(
            body: Center(
              child: ProfileAvatar(
                size: 88,
                url: url,
                initials: 'SK',
                viewerCloseLabel: 'Close',
              ),
            ),
          ),
          theme: AppTheme.dark(),
          disableAnimations: true,
        ),
      );

  double scale(WidgetTester t) => t
      .widget<InteractiveViewer>(find.byType(InteractiveViewer))
      .transformationController!
      .value
      .getMaxScaleOnAxis();

  testWidgets('tap opens; double tap zooms and back; swipe down closes',
      (t) async {
    await pump(t, url: 'https://x.test/me.jpg');
    await t.tap(find.byKey(const ValueKey('avatar-open')));
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('https://x.test/me.jpg')), findsOneWidget);

    final photo = find.byType(InteractiveViewer);
    await t.tap(photo);
    await t.pump(const Duration(milliseconds: 50));
    await t.tap(photo);
    await t.pumpAndSettle();
    expect(scale(t), greaterThan(2));
    await t.tap(photo);
    await t.pump(const Duration(milliseconds: 50));
    await t.tap(photo);
    await t.pumpAndSettle();
    expect(scale(t), closeTo(1, 0.01));

    await t.drag(photo, const Offset(0, 300));
    await t.pumpAndSettle();
    expect(find.byType(InteractiveViewer), findsNothing);
  });

  testWidgets('no photo: initials, a tap does nothing', (t) async {
    await pump(t);
    expect(find.text('SK'), findsOneWidget);
    expect(find.byKey(const ValueKey('avatar-open')), findsNothing);
  });
}
