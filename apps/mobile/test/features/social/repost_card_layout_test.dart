import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-13: a repost keeps the author's name on the card, the
/// "reposted" line sits right under it, and the actions start on the
/// avatar's line with Save at the right edge — at every width and text size.
void main() {
  setUpAll(initializeDateFormatting);

  Post repost() => Post(
        id: 'r1',
        author: const PostAuthor(
          id: 'a1',
          username: 'sofia.hernandez',
          firstName: 'Sofia',
          lastName: 'Hernandez',
          verified: true,
        ),
        title: 'Marriage green card',
        body: 'How a marriage green card case really runs.',
        media: const [],
        tags: const [],
        likeCount: 1250,
        commentCount: 3400000,
        likedByMe: false,
        savedByMe: false,
        isMine: false,
        createdAt: DateTime.now().subtract(const Duration(hours: 11)),
        repostedBy: const PostReposter(id: 'u2', username: 'james.whitfield'),
      );

  for (final size in const [Size(320, 640), Size(360, 740), Size(412, 900)]) {
    for (final scale in const [1.0, 1.6]) {
      testWidgets('repost card at ${size.width}dp, text x$scale', (t) async {
        await t.pumpWidget(
          uxApp(
            Scaffold(
              body: SingleChildScrollView(child: PostCard(post: repost())),
            ),
            theme: AppTheme.dark(),
            size: size,
            textScale: scale,
            overrides: uxOverrides(),
          ),
        );
        await t.pump();
        expect(t.takeException(), isNull);
        expect(find.text('Sofia Hernandez'), findsOneWidget);
        expect(find.textContaining('james.whitfield'), findsOneWidget);
        expect(find.byIcon(AppIcons.bookmarkBorderRounded), findsOneWidget);
        final name = t.getTopLeft(find.text('Sofia Hernandez'));
        final line = t.getTopLeft(find.textContaining('james.whitfield'));
        expect(line.dy, greaterThan(name.dy));
        // Owner 2026-10-28: the shared header (name + role line) sits above it.
        expect(line.dy - name.dy, lessThan(56 * scale));
        // Owner 2026-10-18: the line starts with a small ↻; it sits on the
        // name's edge and the text follows it.
        final icon = t.getTopLeft(find.byIcon(AppIcons.autoModeRounded).first);
        expect(icon.dx, name.dx);
        expect(line.dx, greaterThan(name.dx));
      });
    }
  }
}
