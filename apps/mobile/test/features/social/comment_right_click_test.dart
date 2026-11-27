import 'package:flutter/gestures.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/platform/web_context_menu.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/comment_widgets.dart';
import 'package:material_ui/material_ui.dart';
import 'package:visibility_detector/visibility_detector.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

/// Owner row 113 (Telegram Web / WhatsApp Web): on the website a right-click
/// on a comment opens its long-press menu. Phones: a right-click does
/// nothing new.
void main() {
  setUpAll(initializeDateFormatting);
  setUp(
    () => VisibilityDetectorController.instance.updateInterval = Duration.zero,
  );
  tearDown(() => debugWebContextMenuOverride = null);

  Future<void> rightClick(WidgetTester tester, Finder at) async {
    final g = await tester.startGesture(
      tester.getCenter(at),
      kind: PointerDeviceKind.mouse,
      buttons: kSecondaryMouseButton,
    );
    await g.up();
    await tester.pumpAndSettle();
  }

  final comment = Comment(
    id: 'c1',
    postId: 'p1',
    author: const CommentAuthor(
      isAttorney: false,
      username: 'samk',
      displayName: 'Sam K.',
      verified: false,
    ),
    body: 'Nice post',
    likeCount: 0,
    replyCount: 0,
    likedByMe: false,
    canDelete: false,
    isMine: false,
    createdAt: DateTime.now().subtract(const Duration(hours: 1)),
  );

  Future<void> pumpComment(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: uxOverrides(social: FakeSocialRepository()),
        child: MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: CommentTile(comment: comment, onReply: (_) {}),
          ),
        ),
      ),
    );
    await tester.pump();
  }

  for (final web in [true, false]) {
    testWidgets(
        '${web ? 'website' : 'phone'}: right-click on a comment '
        '${web ? 'opens' : 'does not open'} its menu', (tester) async {
      debugWebContextMenuOverride = web;
      await pumpComment(tester);
      expect(find.text('Report'), findsNothing);
      await rightClick(tester, find.text('Sam K.'));
      expect(find.text('Report'), web ? findsOneWidget : findsNothing);
    });
  }
}
