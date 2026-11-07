import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/presentation/chat_swipe.dart';

import '../../helpers/ux_harness.dart';

void main() {
  // Owner R-055: a short swipe left from the row's right edge still mutes,
  // a long one asks to delete; the row has no delete swipe without onDelete.
  Future<void> pump(
    WidgetTester tester, {
    required VoidCallback onMute,
    VoidCallback? onDelete,
    TextDirection dir = TextDirection.ltr,
  }) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: uxOverrides(),
        child: MaterialApp(
          theme: AppTheme.light(),
          builder: (c, w) => Directionality(textDirection: dir, child: w!),
          home: Scaffold(
            body: ChatSwipe(
              id: 'c1',
              pinned: false,
              muted: false,
              onPin: () {},
              onMute: onMute,
              onDelete: onDelete,
              child: const SizedBox(
                height: 72,
                width: double.infinity,
                child: Text('chat one'),
              ),
            ),
          ),
        ),
      ),
    );
  }

  testWidgets('short swipe left mutes, long swipe left deletes', (
    tester,
  ) async {
    var muted = 0;
    var deleted = 0;
    await pump(tester, onMute: () => muted++, onDelete: () => deleted++);

    await tester.dragFrom(const Offset(380, 36), const Offset(-100, 0));
    await tester.pumpAndSettle();
    expect((muted, deleted), (1, 0));

    final g = await tester.startGesture(const Offset(380, 36));
    await g.moveBy(const Offset(-170, 0));
    await tester.pump();
    expect(find.byKey(const ValueKey('chat-swipe-delete-c1')), findsOneWidget);
    await g.up();
    await tester.pumpAndSettle();
    expect((muted, deleted), (1, 1));
    expect(find.text('chat one'), findsOneWidget);
  });

  testWidgets('without onDelete a long swipe only mutes', (tester) async {
    var muted = 0;
    await pump(tester, onMute: () => muted++);
    final g = await tester.startGesture(const Offset(380, 36));
    await g.moveBy(const Offset(-170, 0));
    await tester.pump();
    expect(find.byKey(const ValueKey('chat-swipe-delete-c1')), findsNothing);
    await g.up();
    await tester.pumpAndSettle();
    expect(muted, 1);
  });

  testWidgets('RTL: the long swipe goes from the left edge to the right',
      (tester) async {
    var muted = 0;
    var deleted = 0;
    await pump(
      tester,
      onMute: () => muted++,
      onDelete: () => deleted++,
      dir: TextDirection.rtl,
    );
    final g = await tester.startGesture(const Offset(10, 36));
    await g.moveBy(const Offset(170, 0));
    await tester.pump();
    expect(find.byKey(const ValueKey('chat-swipe-delete-c1')), findsOneWidget);
    await g.up();
    await tester.pumpAndSettle();
    expect((muted, deleted), (0, 1));
  });
}
