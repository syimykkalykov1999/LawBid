import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/presentation/chat_insert_motion.dart';
import 'package:lawbid/features/feed/presentation/widgets/feed_chrome.dart';
import 'package:lawbid/features/stories/presentation/story_viewer_screen.dart';

import '../../helpers/ux_harness.dart';

/// Owner row 88 (2026-11-13), the rest of the motion audit: the feed's top
/// rows move with the scroll, dialogs come in like an iPhone alert, new
/// chat messages grow in, the photo viewer zooms from its thumbnail and
/// drags in every direction, and the next person's stories slide in.
void main() {
  Widget app(Widget home, {bool still = false}) => MaterialApp(
        theme: AppTheme.light(),
        home: MediaQuery(
          data: MediaQueryData(
            size: const Size(400, 800),
            disableAnimations: still,
          ),
          child: home,
        ),
      );

  void phone(WidgetTester t) {
    t.view.physicalSize = const Size(400, 800);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
  }

  group('feed chrome follows the scroll', () {
    late FeedChromeController chrome;
    setUp(() => chrome = FeedChromeController());
    tearDown(() => chrome.dispose());

    Widget feed({bool still = false}) => app(
          Scaffold(
            body: FeedChrome(
              controller: chrome,
              child: NotificationListener<ScrollNotification>(
                onNotification: chrome.onScroll,
                child: Column(
                  children: [
                    const ChromeCollapse(
                      child: SizedBox(height: 50, child: Text('chips')),
                    ),
                    Expanded(
                      child: ListView.builder(
                        itemCount: 60,
                        itemBuilder: (_, i) =>
                            SizedBox(height: 80, child: Text('row $i')),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          still: still,
        );

    double chipsHeight(WidgetTester t) =>
        t.getSize(find.byType(ChromeCollapse)).height;

    testWidgets('the rows hide pixel for pixel; the row stays under the '
        'finger', (t) async {
      phone(t);
      await t.pumpWidget(feed());
      expect(chipsHeight(t), 50);
      final rowY = t.getTopLeft(find.text('row 2')).dy;
      final g = await t.startGesture(t.getCenter(find.text('row 2')));
      // Past the touch slop first, then 20 px more.
      await g.moveBy(const Offset(0, -20));
      await t.pump();
      final afterSlop = t.getTopLeft(find.text('row 2')).dy;
      final hiddenAfterSlop = 50 - chipsHeight(t);
      await g.moveBy(const Offset(0, -20));
      await t.pump();
      // 20 px of finger = 20 px less chips, and the row moved 20 px, not 40.
      expect(50 - chipsHeight(t), closeTo(hiddenAfterSlop + 20, 0.01));
      expect(
        t.getTopLeft(find.text('row 2')).dy,
        closeTo(afterSlop - 20, 0.01),
      );
      expect(t.getTopLeft(find.text('row 2')).dy, lessThan(rowY));
      await g.up();
      await t.pumpAndSettle();
      // Let go half way while hiding: they finish hiding (snap).
      expect(chipsHeight(t), 0);
      expect(chrome.visible, isFalse);
    });

    testWidgets('a short drag down hides the rest on release; back at the '
        'top they come back', (t) async {
      phone(t);
      await t.pumpWidget(feed());
      await t.drag(find.text('row 3'), const Offset(0, -400));
      await t.pumpAndSettle();
      expect(chipsHeight(t), 0);
      // Scrolling up mid-list keeps them away (owner 2026-10-12).
      await t.drag(find.text('row 8'), const Offset(0, 100));
      await t.pumpAndSettle();
      expect(chipsHeight(t), 0);
      // At the very top they return.
      chrome.show();
      await t.pump();
      await t.pump(FeedChromeController.snapDuration ~/ 2);
      expect(chipsHeight(t), inExclusiveRange(0, 50));
      await t.pumpAndSettle();
      expect(chipsHeight(t), 50);
    });

    testWidgets('«Mine» (revealOnUp): a scroll up brings them back with the '
        'finger', (t) async {
      phone(t);
      chrome.dispose();
      chrome = FeedChromeController(revealOnUp: true);
      await t.pumpWidget(feed());
      await t.drag(find.text('row 3'), const Offset(0, -400));
      await t.pumpAndSettle();
      expect(chipsHeight(t), 0);
      final g = await t.startGesture(t.getCenter(find.text('row 8')));
      await g.moveBy(const Offset(0, 20));
      await t.pump();
      await g.moveBy(const Offset(0, 20));
      await t.pump();
      expect(chipsHeight(t), greaterThan(19));
      await g.up();
      await t.pumpAndSettle();
      expect(chipsHeight(t), 50);
    });

    testWidgets('reduce motion: the snap is instant', (t) async {
      phone(t);
      await t.pumpWidget(feed(still: true));
      await t.drag(find.text('row 3'), const Offset(0, -400));
      await t.pump();
      chrome.show();
      await t.pump();
      expect(chipsHeight(t), 50);
    });
  });

  group('dialogs come in like an iPhone alert', () {
    Future<void> open(WidgetTester t, {bool still = false}) async {
      await t.pumpWidget(
        app(
          Builder(
            builder: (c) => TextButton(
              onPressed: () => showAppDialog<void>(
                context: c,
                builder: (_) => const AlertDialog(content: Text('hello')),
              ),
              child: const Text('open'),
            ),
          ),
          still: still,
        ),
      );
      await t.tap(find.text('open'));
      await t.pump();
    }

    double scale(WidgetTester t) => t
        .widget<Transform>(
          find
              .ancestor(
                of: find.byType(AlertDialog),
                matching: find.byType(Transform),
              )
              .first,
        )
        .transform
        .getMaxScaleOnAxis();

    testWidgets('scales 1.3 → 1 on the iOS spring, fades out only',
        (t) async {
      await open(t);
      await t.pump(const Duration(milliseconds: 30));
      expect(scale(t), greaterThan(1.05));
      expect(scale(t), lessThanOrEqualTo(AppDialogMotion.scaleFrom));
      await t.pump(AppDialogMotion.duration);
      expect(scale(t), closeTo(1, 0.002));
      Navigator.of(t.element(find.text('hello'))).pop();
      await t.pump();
      await t.pump(const Duration(milliseconds: 100));
      expect(find.text('hello'), findsOneWidget);
      expect(scale(t), 1, reason: 'leaving: fade only');
      await t.pumpAndSettle();
      expect(find.text('hello'), findsNothing);
    });

    testWidgets('the spring curve starts at 0 and ends at 1', (t) async {
      expect(AppDialogMotion.curve.transform(0), 0);
      expect(AppDialogMotion.curve.transform(1), 1);
      expect(AppDialogMotion.curve.transform(0.5), greaterThan(0.8));
    });

    testWidgets('reduce motion: shown at once, no scale', (t) async {
      await open(t, still: true);
      expect(find.text('hello'), findsOneWidget);
      expect(find.byType(AppDialogScaleIn), findsNothing);
    });
  });

  group('a new chat message grows in', () {
    Widget row({required bool animate, bool still = false, bool mine = true}) =>
        app(
          Scaffold(
            body: ChatInsertMotion(
              animate: animate,
              mine: mine,
              child: const SizedBox(height: 40, child: Text('msg')),
            ),
          ),
          still: still,
        );

    testWidgets('fade + size + scale from the own side, 250 ms', (t) async {
      await t.pumpWidget(row(animate: true));
      await t.pump(const Duration(milliseconds: 60));
      Finder inRow(Type type) => find.descendant(
            of: find.byType(ChatInsertMotion),
            matching: find.byType(type),
          );
      final size = t.widget<SizeTransition>(inRow(SizeTransition));
      expect(size.sizeFactor.value, inExclusiveRange(0, 1));
      final scale = t.widget<ScaleTransition>(inRow(ScaleTransition));
      expect(scale.alignment, Alignment.centerRight);
      await t.pump(ChatInsertMotion.duration);
      expect(size.sizeFactor.value, 1);
      expect(t.getSize(find.byType(ChatInsertMotion)).height, 40);
    });

    testWidgets('old rows and reduce motion: no motion', (t) async {
      Finder sized() => find.descendant(
            of: find.byType(ChatInsertMotion),
            matching: find.byType(SizeTransition),
          );
      await t.pumpWidget(row(animate: false));
      expect(sized(), findsNothing);
      await t.pumpWidget(const SizedBox());
      await t.pumpWidget(row(animate: true, still: true));
      expect(sized(), findsNothing);
    });
  });

  group('photo viewer', () {
    setUp(() {
      debugGalleryImage = (url) => ColoredBox(
            key: ValueKey(url),
            color: Colors.blueGrey,
          );
    });
    tearDown(() => debugGalleryImage = null);

    const url = 'https://x.test/p.jpg';

    Widget thumbScreen() => uxApp(
          theme: AppTheme.dark(),
          size: const Size(400, 800),
          Scaffold(
            body: Builder(
              builder: (c) => GestureDetector(
                onTap: () => showPhotoGallery(c, urls: [url]),
                child: const GalleryHero(
                  url: url,
                  child: SizedBox.square(
                    dimension: 80,
                    child: ColoredBox(color: Colors.red),
                  ),
                ),
              ),
            ),
          ),
        );

    testWidgets('opens out of the tapped thumbnail (a Hero flight)',
        (t) async {
      phone(t);
      await t.pumpWidget(thumbScreen());
      await t.tap(find.byType(GalleryHero));
      await t.pump();
      await t.pump(const Duration(milliseconds: 100));
      // Mid-flight: the photo is between the thumbnail and the screen.
      final photo = find.byKey(const ValueKey(url));
      expect(photo, findsOneWidget);
      final mid = t.getSize(photo);
      expect(mid.width, inExclusiveRange(80, 400));
      await t.pumpAndSettle();
      expect(t.getSize(photo).width, 400);
    });

    testWidgets('a diagonal drag moves it both ways and shrinks it; a short '
        'one springs back', (t) async {
      phone(t);
      await t.pumpWidget(thumbScreen());
      await t.tap(find.byType(GalleryHero));
      await t.pumpAndSettle();
      final photo = find.byKey(const ValueKey(url));
      final start = t.getCenter(photo);
      final g = await t.startGesture(start);
      await g.moveBy(const Offset(0, 30));
      await t.pump();
      await g.moveBy(const Offset(30, 30));
      await t.pump();
      final moved = t.getCenter(photo);
      expect(moved.dy, greaterThan(start.dy + 20));
      expect(moved.dx, greaterThan(start.dx + 20));
      expect(t.getRect(photo).width, lessThan(400));
      await t.pump(const Duration(milliseconds: 300));
      await g.up(timeStamp: const Duration(seconds: 1));
      await t.pumpAndSettle();
      expect(t.getCenter(photo).dx, closeTo(start.dx, 0.5));
      expect(t.getCenter(photo).dy, closeTo(start.dy, 0.5));
    });

    testWidgets('dragged up far, it closes too', (t) async {
      phone(t);
      await t.pumpWidget(thumbScreen());
      await t.tap(find.byType(GalleryHero));
      await t.pumpAndSettle();
      await t.drag(find.byKey(const ValueKey(url)), const Offset(0, -200));
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey(url)), findsNothing);
    });

    testWidgets('two thumbnails of one photo do not clash', (t) async {
      phone(t);
      await t.pumpWidget(
        uxApp(
          theme: AppTheme.dark(),
          const Scaffold(
            body: Column(
              children: [
                GalleryHero(url: url, child: SizedBox.square(dimension: 40)),
                GalleryHero(url: url, child: SizedBox.square(dimension: 40)),
              ],
            ),
          ),
        ),
      );
      final tags = t
          .widgetList<Hero>(find.byType(Hero))
          .map((h) => h.tag)
          .toSet();
      expect(tags, hasLength(2));
    });
  });

  group('stories: the next person slides in', () {
    Widget slide(int step, String who, {bool still = false}) => app(
          StoryPeopleSlide(
            step: step,
            child: KeyedSubtree(
              key: ValueKey(who),
              child: Center(child: Text(who)),
            ),
          ),
          still: still,
        );

    testWidgets('from the right going on, the last one out to the left',
        (t) async {
      phone(t);
      await t.pumpWidget(slide(1, 'anna'));
      await t.pumpWidget(slide(1, 'ben'));
      await t.pump(const Duration(milliseconds: 80));
      expect(t.getCenter(find.text('ben')).dx, greaterThan(200));
      expect(t.getCenter(find.text('anna')).dx, lessThan(200));
      await t.pumpAndSettle();
      expect(find.text('anna'), findsNothing);
      expect(t.getCenter(find.text('ben')).dx, 200);
    });

    testWidgets('going back comes from the left', (t) async {
      phone(t);
      await t.pumpWidget(slide(-1, 'ben'));
      await t.pumpWidget(slide(-1, 'anna'));
      await t.pump(const Duration(milliseconds: 80));
      expect(t.getCenter(find.text('anna')).dx, lessThan(200));
      await t.pumpAndSettle();
    });

    testWidgets('reduce motion: a cut', (t) async {
      phone(t);
      await t.pumpWidget(slide(1, 'anna', still: true));
      await t.pumpWidget(slide(1, 'ben', still: true));
      await t.pump();
      expect(find.text('anna'), findsNothing);
      expect(t.getCenter(find.text('ben')).dx, 200);
    });
  });
}
