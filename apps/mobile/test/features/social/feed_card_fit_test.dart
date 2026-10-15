import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

import '../../helpers/long_locale.dart';
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
  }) =>
      Post(
        id: 'p1',
        author: author,
        body: body,
        media: photo
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
            : const [],
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

  final cases = <String, Post>{
    'short text': post(body: 'Short note.'),
    'long text': post(body: 'A long post about the green card. ' * 60),
    'repost': post(body: 'Reposted text.', repost: true),
    'photo': post(body: 'With a photo.', photo: true),
  };

  for (final (code, dir) in const [
    ('ru', TextDirection.ltr),
    ('de', TextDirection.ltr),
    ('ar', TextDirection.rtl),
  ]) {
    for (final scale in const [1.0, 1.3]) {
      for (final e in cases.entries) {
        testWidgets('${e.key} card, $code, text x$scale', (t) async {
          useNarrowPhone(t);
          final formats = L10nFormats(AppLanguage.fromCode(code));
          await t.pumpWidget(
            uxApp(
              Directionality(
                textDirection: dir,
                child: Scaffold(
                  body: SingleChildScrollView(
                    // The feed passes a viewport height; the card must not
                    // take it as its own.
                    child: PostCard(post: e.value, feedHeight: 700),
                  ),
                ),
              ),
              theme: AppTheme.dark(),
              size: narrowPhone,
              textScale: scale,
              overrides: uxOverrides(
                translator: _Safe(
                  code == 'ru'
                      ? const StaticTranslatorRu()
                      : const StaticTranslatorEn(),
                ),
                extra: [l10nFormatsProvider.overrideWithValue(formats)],
              ),
            ),
          );
          await t.pump();
          expect(t.takeException(), isNull);
          final h = t.getSize(find.byType(PostCard)).height;
          if (e.key == 'short text' || e.key == 'repost') {
            // Short content, short card (no fixed viewport-sized box).
            expect(h, lessThan(300 * scale));
          } else if (e.key == 'long text') {
            // A long text is folded, not endless.
            expect(h, lessThan(700 * scale));
          }
          await t.pumpWidget(const SizedBox());
          await t.pump(const Duration(seconds: 10));
        });
      }
    }
  }
}
