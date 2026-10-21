import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

/// Owner 2026-10-20: a tap on the like counter opens the list of people who
/// liked the post.
void main() {
  setUpAll(initializeDateFormatting);

  testWidgets('tap on the like counter opens the likers list', (t) async {
    t.view.physicalSize = const Size(400, 1200);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    final post = fakePost('p1', likes: 5, withPhoto: true);
    await t.pumpWidget(
      uxApp(
        Scaffold(body: SingleChildScrollView(child: PostCard(post: post))),
        theme: AppTheme.light(),
        size: const Size(400, 1200),
        overrides: uxOverrides(social: FakeSocialRepository()),
      ),
    );
    await t.pump(const Duration(seconds: 1));
    expect(find.byType(LikersScreen), findsNothing);
    await t.tap(find.text('5'));
    await t.pump(const Duration(milliseconds: 400));
    await t.pumpAndSettle();
    expect(find.byType(LikersScreen), findsOneWidget);
    await t.pumpWidget(const SizedBox());
    await t.pump(const Duration(seconds: 30));
  });

  // Owner 2026-10-21 (Instagram): no big emoji, the caption's own size.
  testWidgets('a one-emoji post keeps the caption size in the feed card',
      (t) async {
    t.view.physicalSize = const Size(400, 1200);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    final post = fakePost('p2', withPhoto: true).copyWith(body: '😎');
    await t.pumpWidget(
      uxApp(
        Scaffold(body: SingleChildScrollView(child: PostCard(post: post))),
        theme: AppTheme.light(),
        size: const Size(400, 1200),
        overrides: uxOverrides(social: FakeSocialRepository()),
      ),
    );
    await t.pump(const Duration(seconds: 1));
    // Owner 2026-10-21 (Instagram): the author's username leads the line,
    // bold; the caption keeps the regular size.
    final caption = t.widget<RichText>(
      find.textContaining('😎', findRichText: true).first,
    );
    final root = caption.text as TextSpan;
    expect(root.style?.fontSize, 14);
    final spans = (root.children!.first as TextSpan).children ?? root.children!;
    final lead = spans.first as TextSpan;
    expect(lead.text, contains(post.author.username));
    expect(lead.style?.fontWeight, FontWeight.w700);
    expect((spans[1] as TextSpan).text, contains('😎'));
    await t.pumpWidget(const SizedBox());
    await t.pump(const Duration(seconds: 30));
  });
}
