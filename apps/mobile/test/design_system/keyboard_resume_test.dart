import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:material_ui/material_ui.dart';

/// Owner bug 2026-11-27 (Samsung S26 Ultra, Android 16, prod 562e95f62):
/// the post comments sheet with the keyboard up → Home → back to the app.
/// The keyboard is gone, but the sheet stayed laid out above it: the list
/// squeezed to the top, the field mid-screen, the bottom ~45 % empty.
///
/// The Android side (ImeInsetsRefresher.kt) now hands Flutter the real
/// window insets when the window gets its focus back. This test pins the
/// Dart side: once the platform reports zero insets after the resume, every
/// layer between the window and the sheet (SystemNavBand, the modal route,
/// the sheet's own keyboard padding) shows the full layout at once — no
/// layer may keep its own copy of the old keyboard height. On Android the
/// field keeps its focus across the pause (FocusManager does not suspend
/// focus on mobile), exactly as on the phone.
void main() {
  const screen = Size(400, 800);
  const band = 48.0;
  const keyboard = 360.0;

  Widget app() => MaterialApp(
        theme: AppTheme.light(),
        builder: (context, child) => SystemNavBand(child: child!),
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () => showModalBottomSheet<void>(
                  context: context,
                  isScrollControlled: true,
                  useSafeArea: true,
                  builder: (context) => Padding(
                    // Same as CommentsSheet: the field rides above the
                    // keyboard.
                    padding: EdgeInsets.only(
                      bottom: MediaQuery.viewInsetsOf(context).bottom,
                    ),
                    child: DraggableScrollableSheet(
                      expand: false,
                      initialChildSize: 0.55,
                      builder: (context, controller) => Column(
                        children: [
                          Expanded(
                            child: ListView(
                              key: const Key('comments'),
                              controller: controller,
                              children: const [SizedBox(height: 2000)],
                            ),
                          ),
                          const TextField(
                            key: Key('comment-field'),
                            autofocus: true,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                child: const Text('comments'),
              ),
            ),
          ),
        ),
      );

  Future<void> openWithKeyboard(WidgetTester tester) async {
    tester.view
      ..physicalSize = screen
      ..devicePixelRatio = 1
      ..viewPadding = const FakeViewPadding(bottom: band)
      ..padding = const FakeViewPadding(bottom: band);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(app());
    await tester.tap(find.text('comments'));
    await tester.pumpAndSettle();
    // The phone opens the keyboard for the focused field.
    tester.view.viewInsets = const FakeViewPadding(bottom: keyboard);
    await tester.pumpAndSettle();
    expect(
      FocusManager.instance.primaryFocus?.context
          ?.findAncestorStateOfType<EditableTextState>(),
      isNotNull,
      reason: 'the comment field has the keyboard',
    );
    expect(
      tester.getBottomLeft(find.byKey(const Key('comment-field'))).dy,
      moreOrLessEquals(screen.height - keyboard),
      reason: 'with the keyboard up the field sits right above it',
    );
  }

  Future<void> leaveAndComeBack(WidgetTester tester) async {
    final binding = tester.binding;
    for (final state in [
      AppLifecycleState.inactive,
      AppLifecycleState.hidden,
      AppLifecycleState.paused,
    ]) {
      binding.handleAppLifecycleStateChanged(state);
    }
    await tester.pump();
    // Back from the background: the system has closed the keyboard and the
    // window reports its real insets (no keyboard).
    tester.view.viewInsets = FakeViewPadding.zero;
    for (final state in [
      AppLifecycleState.hidden,
      AppLifecycleState.inactive,
      AppLifecycleState.resumed,
    ]) {
      binding.handleAppLifecycleStateChanged(state);
    }
    await tester.pumpAndSettle();
  }

  for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
    testWidgets(
      'comments sheet: keyboard → Home → back = full layout '
      '(${platform.name})',
      (tester) async {
        debugDefaultTargetPlatformOverride = platform;
        await openWithKeyboard(tester);
        await leaveAndComeBack(tester);

        final bottom = platform == TargetPlatform.android
            // SystemNavBand keeps the navigation-bar strip below the app.
            ? screen.height - band
            : screen.height;
        expect(
          tester.getBottomLeft(find.byKey(const Key('comment-field'))).dy,
          moreOrLessEquals(bottom),
          reason: 'the field is back at the bottom of the sheet, '
              'not mid-screen',
        );
        // The sheet is again 55 % of the full height, not of the part
        // above an old keyboard.
        final sheetTop =
            tester.getTopLeft(find.byType(DraggableScrollableSheet)).dy;
        expect(bottom - sheetTop, greaterThan(0.5 * bottom));
        debugDefaultTargetPlatformOverride = null;
      },
    );
  }

  testWidgets('keyboard really back after the resume: field above it again',
      (tester) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    await openWithKeyboard(tester);
    await leaveAndComeBack(tester);
    // The user taps the field again and the keyboard opens: the real inset
    // must pass straight through (nothing is muted after a resume).
    tester.view.viewInsets = const FakeViewPadding(bottom: keyboard);
    await tester.pumpAndSettle();
    expect(
      tester.getBottomLeft(find.byKey(const Key('comment-field'))).dy,
      moreOrLessEquals(screen.height - keyboard),
    );
    debugDefaultTargetPlatformOverride = null;
  });
}
