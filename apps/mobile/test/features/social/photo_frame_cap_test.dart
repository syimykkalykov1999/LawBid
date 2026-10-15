import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

/// Owner 2026-10-15: in a list a photo is at most square, cropped to the
/// centre, whatever its stored size — a tall 3:4 photo, one whose size is
/// unknown (an old upload), a very wide one.
Future<void> main() async {
  await initializeDateFormatting();
  PostMedia media(int? w, int? h) => PostMedia(
        fileId: 'f1',
        url: 'https://example.test/1.jpg',
        previewUrl: 'https://example.test/1_320.jpg',
        mediumUrl: 'https://example.test/1_1080.jpg',
        width: w,
        height: h,
      );

  test('the list ratio is never taller than 1:1', () {
    expect(media(1080, 1440).listAspectRatio, 1.0); // 3:4
    expect(media(1000, 3000).listAspectRatio, 1.0);
    expect(media(null, null).listAspectRatio, 1.0); // an old upload
    expect(media(1080, 608).listAspectRatio, closeTo(1.78, 0.01));
    expect(media(3000, 500).listAspectRatio, 1.91);
  });

  for (final (name, m) in [
    ('3:4', media(1080, 1440)),
    ('very tall', media(500, 2000)),
    ('unknown size', media(null, null)),
  ]) {
    testWidgets('a $name photo takes at most a square in the feed', (t) async {
      useNarrowPhone(t);
      await t.pumpWidget(
        uxApp(
          Scaffold(
            body: SingleChildScrollView(
              child: PostCard(
                post: Post(
                  id: 'p1',
                  author: const PostAuthor(
                    id: 'a1',
                    username: 'priya',
                    firstName: 'Priya',
                    lastName: 'Natarajan',
                    verified: true,
                  ),
                  body: 'A photo post.',
                  media: [m],
                  tags: const [],
                  likeCount: 3,
                  commentCount: 1,
                  likedByMe: false,
                  savedByMe: false,
                  isMine: false,
                  createdAt: DateTime.now(),
                ),
                feedHeight: 800,
              ),
            ),
          ),
          theme: AppTheme.dark(),
          size: narrowPhone,
          overrides: uxOverrides(
            translator: const StaticTranslatorRu(),
            extra: [
              l10nFormatsProvider
                  .overrideWithValue(L10nFormats(AppLanguage.fromCode('ru'))),
            ],
          ),
        ),
      );
      await t.pump();
      final width = t.getSize(find.byType(PostCard)).width;
      final photo = find.byType(PostMediaCarousel);
      expect(photo, findsOneWidget);
      expect(t.getSize(photo).height, lessThanOrEqualTo(width + 0.5));
      await t.pumpWidget(const SizedBox());
      await t.pump(const Duration(seconds: 10));
    });
  }
}
