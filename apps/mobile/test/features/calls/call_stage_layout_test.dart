import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_video_layout.dart';
import 'package:lawbid/features/calls/presentation/call_group.dart';
import 'package:lawbid/features/calls/presentation/call_screen.dart';
import 'package:lawbid/features/calls/presentation/call_stage.dart';

import '../../helpers/ux_harness.dart';
import 'call_screen_fakes.dart';

/// Owner 2026-10-26 (calls exactly like WhatsApp): odd counts never leave a
/// hole (the last row stretches), rows share the height, two people are
/// stacked; the controls of a video call fade after 4 s untouched and come
/// back on a tap; a voice call never hides them.
void main() {
  const area = Size(390, 700);

  List<int> rowsOf(List<Rect> rects) {
    final byTop = <double, int>{};
    for (final r in rects) {
      byTop[r.top] = (byTop[r.top] ?? 0) + 1;
    }
    return byTop.values.toList();
  }

  test('rows per count: 2 stacked, 3 = 2+1, 5 = 2+2+1, 7 = 3+3+1, 8 = 3+3+2',
      () {
    expect(rowsOf(callGridRects(1, area)), [1]);
    expect(rowsOf(callGridRects(2, area)), [1, 1]);
    expect(rowsOf(callGridRects(3, area)), [2, 1]);
    expect(rowsOf(callGridRects(4, area)), [2, 2]);
    expect(rowsOf(callGridRects(5, area)), [2, 2, 1]);
    expect(rowsOf(callGridRects(6, area)), [2, 2, 2]);
    expect(rowsOf(callGridRects(7, area)), [3, 3, 1]);
    expect(rowsOf(callGridRects(8, area)), [3, 3, 2]);
    expect(rowsOf(callGridRects(9, area)), [3, 3, 3]);
  });

  test('no hole: every row spans the full width, rows share the height', () {
    for (var n = 1; n <= 9; n++) {
      final rects = callGridRects(n, area);
      final rows = <double, List<Rect>>{};
      for (final r in rects) {
        (rows[r.top] ??= []).add(r);
      }
      final heights = {for (final r in rects) r.height.toStringAsFixed(3)};
      expect(heights, hasLength(1), reason: 'n=$n rows share the height');
      for (final row in rows.values) {
        final left = row.map((r) => r.left).reduce((a, b) => a < b ? a : b);
        final right = row.map((r) => r.right).reduce((a, b) => a > b ? a : b);
        expect(left, closeTo(kCallTileGap, 0.01), reason: 'n=$n');
        expect(right, closeTo(area.width - kCallTileGap, 0.01), reason: 'n=$n');
      }
      final bottom = rects.map((r) => r.bottom).reduce((a, b) => a > b ? a : b);
      expect(bottom, closeTo(area.height - kCallTileGap, 0.01), reason: 'n=$n');
    }
  });

  test('more than nine: three columns, a third of the height each, scrolls',
      () {
    final rects = callGridRects(12, area);
    expect(rowsOf(rects), [3, 3, 3, 3]);
    expect(callGridHeight(12, area), greaterThan(area.height));
  });

  test(
      'one person big: the whole screen; the others in a row above the '
      'controls', () {
    final f = callFocusRects(3, area, stripBottom: 120);
    expect(f.big, Offset.zero & area);
    expect(f.strip, hasLength(3));
    for (final r in f.strip) {
      expect(r.bottom, closeTo(area.height - 120, 0.01));
      expect(r.size, kCallStripCard);
    }
  });

  Future<ProviderContainer> pump(
    WidgetTester tester, {
    required bool video,
  }) async {
    tester.view
      ..physicalSize = const Size(390, 844) * 3
      ..devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final s = callSession1to1(CallPhase.active, video: video);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [...uxOverrides(), ...callScreenFakeOverrides(s)],
        child: MaterialApp(
          theme: AppTheme.of(AppThemeId.values.first),
          home: const CallScreen(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    return ProviderScope.containerOf(tester.element(find.byType(CallScreen)));
  }

  testWidgets('video: the controls fade after 4 s, a tap brings them back',
      (tester) async {
    final c = await pump(tester, video: true);
    expect(c.read(callVideoLayoutProvider).controlsHidden, isFalse);
    await tester.pump(const Duration(seconds: 3));
    expect(c.read(callVideoLayoutProvider).controlsHidden, isFalse);
    await tester.pump(const Duration(seconds: 2));
    expect(c.read(callVideoLayoutProvider).controlsHidden, isTrue);
    await tester.tap(find.byKey(const Key('call-video-bg')));
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.read(callVideoLayoutProvider).controlsHidden, isFalse);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('voice: the controls never hide', (tester) async {
    final c = await pump(tester, video: false);
    await tester.pump(const Duration(seconds: 10));
    expect(c.read(callVideoLayoutProvider).controlsHidden, isFalse);
    expect(find.byKey(const Key('call-btn-end')), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('the sheet pulls up to the people and «Add participant»',
      (tester) async {
    await pump(tester, video: false);
    expect(find.byType(CallMembersPanel), findsNothing);
    await tester.tap(find.byKey(const Key('call-sheet-grabber')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(CallMembersPanel), findsOneWidget);
    expect(find.text('Amelia Hart'), findsWidgets);
    expect(tester.takeException(), isNull);
    // And back down.
    await tester.tap(find.byKey(const Key('call-sheet-grabber')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(CallMembersPanel), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('a tap on a tile makes that person big; on the big one, back',
      (tester) async {
    tester.view
      ..physicalSize = const Size(390, 844) * 3
      ..devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...uxOverrides(),
          ...callScreenFakeOverrides(callSessionGroup(4, video: true)),
        ],
        child: MaterialApp(
          theme: AppTheme.of(AppThemeId.values.first),
          home: const CallScreen(),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));
    final c =
        ProviderScope.containerOf(tester.element(find.byType(CallScreen)));
    await tester.tap(find.byKey(const Key('call-tile-u2')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    // Mid-way: the tile is moving, not jumping.
    final mid = tester.getRect(find.byKey(const Key('call-tile-u2')));
    await tester.pump(const Duration(milliseconds: 250));
    final end = tester.getRect(find.byKey(const Key('call-tile-u2')));
    expect(c.read(callVideoLayoutProvider).focusId, 'u2');
    expect(end.size, const Size(390, 844));
    expect(mid.width, inExclusiveRange(150, 390));
    await tester.tap(find.byKey(const Key('call-tile-u2')));
    await tester.pump(const Duration(milliseconds: 400));
    expect(c.read(callVideoLayoutProvider).focusId, isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 5));
  });
}
