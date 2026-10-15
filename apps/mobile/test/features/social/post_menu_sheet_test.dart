import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-15: the "…" sheet of my own post (Save, Edit, Pin, Boost,
/// Delete) sizes to its content and scrolls on a short screen — nothing is
/// cut off, nothing overflows.
void main() {
  setUpAll(initializeDateFormatting);

  final post = Post(
    id: 'p1',
    author: const PostAuthor(
      id: 'a1',
      username: 'sofia.hernandez',
      firstName: 'Sofia',
      lastName: 'Hernandez',
      verified: true,
    ),
    body: 'Text',
    media: const [],
    tags: const [],
    likeCount: 1,
    commentCount: 1,
    likedByMe: false,
    savedByMe: false,
    isMine: true,
    createdAt: DateTime(2026, 10, 14),
  );

  for (final height in [300.0, 780.0]) {
    testWidgets('own post menu on a ${height}dp screen', (t) async {
      t.view.physicalSize = Size(360, height);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      await t.pumpWidget(
        uxApp(
          Scaffold(
            body: Consumer(
              builder: (context, ref, _) => TextButton(
                onPressed: () => showPostMenu(context, ref, post),
                child: const Text('open'),
              ),
            ),
          ),
          theme: AppTheme.dark(),
          size: Size(360, height),
          overrides: uxOverrides(),
        ),
      );
      await t.tap(find.text('open'));
      await t.pumpAndSettle();
      expect(t.takeException(), isNull);
      expect(find.byKey(const ValueKey('post-menu-save')), findsOneWidget);
      await t.drag(
        find.byType(SingleChildScrollView).last,
        const Offset(0, -400),
      );
      await t.pumpAndSettle();
      expect(t.takeException(), isNull);
    });
  }
}
