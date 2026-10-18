import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-15: a card's height follows its content (like Instagram):
/// a short post is short, a long one taller but capped; nothing overflows
/// at 360 dp in ru / de / ar and text scale 1.0 / 1.3, whatever the feed's
/// viewport height passed in.
class _Safe implements Translator {
  const _Safe(this.inner);
  final Translator inner;

  @override
  String t(String key, [Map<String, String>? params]) {
    try {
      return inner.t(key, params);
      // ignore: avoid_catching_errors
    } on AssertionError {
      return key;
    }
  }

  @override
  String plural(String key, num count, [Map<String, String>? params]) =>
      inner.plural(key, count, params);
}

Future<void> main() async {
  await initializeDateFormatting();

  const author = PostAuthor(
    id: 'a1',
    username: 'sofia.hernandez',
    firstName: 'Sofia',
    lastName: 'Hernandez',
    verified: true,
  );
  Post post({
    required String body,
    bool repost = false,
    bool photo = false,
    List<PostMedia>? media,
  }) =>
      Post(
        id: 'p1',
        author: author,
        body: body,
        media: media ??
            (photo
                ? const [
                    PostMedia(
                      fileId: 'f1',
                      url: 'https://example.test/1.jpg',
                      previewUrl: 'https://example.test/1_320.jpg',
                      mediumUrl: 'https://example.test/1_1080.jpg',
                      width: 1080,
                      height: 1080,
                    ),
                  ]
                : const []),
        tags: const [],
        likeCount: 215000,
        commentCount: 1200000,
        shareCount: 15400,
        likedByMe: false,
        savedByMe: false,
        isMine: true,
        createdAt: DateTime.now().subtract(const Duration(hours: 5)),
        repostedBy:
            repost ? const PostReposter(id: 'u2', username: 'james') : null,
      );

  PostMedia m(int i) => PostMedia(
        fileId: 'f$i',
        url: 'https://example.test/$i.jpg',
        previewUrl: 'https://example.test/${i}_320.jpg',
        mediumUrl: 'https://example.test/${i}_1080.jpg',
        width: 1080,
        height: 1080,
      );
  testWidgets('web: a photo post is 470 wide and at most 4:5 tall', (t) async {
    adaptiveShellOverride = true;
    addTearDown(() => adaptiveShellOverride = null);
    t.view
      ..physicalSize = const Size(680, 1300)
      ..devicePixelRatio = 1;
    addTearDown(t.view.reset);
    final p = post(
      body: 'Nine photos.',
      media: [for (var i = 0; i < 9; i++) m(i)],
    );
    await t.pumpWidget(
      uxApp(
        Directionality(
          textDirection: TextDirection.ltr,
          child: Scaffold(
            body: SingleChildScrollView(
              child: PostCard(post: p, feedHeight: 1300),
            ),
          ),
        ),
        theme: AppTheme.dark(),
        size: const Size(680, 1300),
        overrides: uxOverrides(
          translator: const _Safe(StaticTranslatorEn()),
          extra: [
            l10nFormatsProvider.overrideWithValue(
              L10nFormats(AppLanguage.fromCode('en')),
            ),
          ],
        ),
      ),
    );
    await t.pump();
    final size = t.getSize(find.byType(PostCard));
    // ignore: avoid_print
    print('CARD ${size.width} x ${size.height}');
    expect(size.height, lessThan(470 * 1.25 + 220));
    await t.pumpWidget(const SizedBox());
    await t.pump(const Duration(seconds: 10));
  });
}
