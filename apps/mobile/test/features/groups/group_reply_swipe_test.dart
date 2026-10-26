import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_message_bubble.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

import '../../helpers/ux_harness.dart';
import 'fake_group_repository.dart';

/// Owner 2026-10-22 (Telegram): in a group thread a message is quoted by
/// dragging it toward the START side, the same as in a 1:1 chat. A drag
/// toward the END is the screen's "back" gesture and must not quote.
Future<void> _pumpBubble(
  WidgetTester tester,
  VoidCallback onReply, {
  TextDirection direction = TextDirection.ltr,
}) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    uxApp(
      Directionality(
        textDirection: direction,
        child: Scaffold(
          body: GroupMessageBubble(
            message: message('m1', body: 'Hello group'),
            groupId: 'g1',
            showName: false,
            showAvatar: false,
            canClose: false,
            highlighted: false,
            onMenu: () {},
            onPollChanged: (_) {},
            onReply: onReply,
          ),
        ),
      ),
      theme: AppTheme.light(),
      disableAnimations: true,
      overrides: uxOverrides(
        extra: [currentUserIdProvider.overrideWithValue('me')],
      ),
    ),
  );
  await tester.pump();
}

Future<void> _drag(WidgetTester tester, double dx) async {
  final g = await tester.startGesture(
    tester.getCenter(find.byType(GroupMessageBubble)),
  );
  for (var i = 0; i < 10; i++) {
    await g.moveBy(Offset(dx / 10, 0));
    await tester.pump(const Duration(milliseconds: 16));
  }
  await g.up();
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(initializeDateFormatting);

  testWidgets('a group message quotes on a drag toward the start (LTR)',
      (tester) async {
    var replies = 0;
    await _pumpBubble(tester, () => replies++);
    await _drag(tester, -150);
    expect(replies, 1);
  });

  testWidgets('a short drag toward the start does not quote', (tester) async {
    var replies = 0;
    await _pumpBubble(tester, () => replies++);
    await _drag(tester, -20);
    expect(replies, 0);
  });

  testWidgets('a drag toward the end (back gesture) does not quote',
      (tester) async {
    var replies = 0;
    await _pumpBubble(tester, () => replies++);
    await _drag(tester, 150);
    expect(replies, 0);
  });

  testWidgets('mirrored in RTL: the start side is the right', (tester) async {
    var replies = 0;
    await _pumpBubble(tester, () => replies++, direction: TextDirection.rtl);
    await _drag(tester, 150);
    expect(replies, 1);
  });
}
