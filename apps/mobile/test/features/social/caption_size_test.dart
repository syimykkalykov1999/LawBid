import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_text_cover.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

/// Owner 2026-10-21 (Instagram): every post caption — feed, photo, brief,
/// grid cover — is the one regular size; emoji never grow.
void main() {
  setUpAll(initializeDateFormatting);

  Post post({
    required String body,
    String? title,
    List<PostMedia> media = const [],
  }) =>
      Post(
        id: 'p1',
        author: const PostAuthor(
          id: 'a1',
          username: 'sofia.hernandez',
          firstName: 'Sofia',
          lastName: 'Hernandez',
          verified: true,
        ),
        title: title,
        body: body,
        media: media,
        tags: const [],
        likeCount: 3,
        commentCount: 2,
        likedByMe: false,
        savedByMe: false,
        isMine: false,
        createdAt: DateTime.now().subtract(const Duration(days: 1)),
      );

  const photo = PostMedia(
    fileId: 'f1',
    url: 'https://example.test/1.jpg',
    previewUrl: 'https://example.test/1_320.jpg',
    mediumUrl: 'https://example.test/1_1080.jpg',
    width: 1080,
    height: 1080,
  );

  final posts = {
    'photo': post(body: 'Three things to know 😀', media: const [photo]),
    'photo emoji': post(body: '😀', media: const [photo]),
    'brief': post(title: 'A brief', body: 'Three things to know.'),
    'brief emoji': post(body: '😀🔥'),
  };

  final languages = <(String, Translator, TextDirection)>[
    ('ru', const StaticTranslatorRu(), TextDirection.ltr),
    ('ne', ShippedTranslator('ne'), TextDirection.ltr),
    ('ar', ShippedTranslator('ar'), TextDirection.rtl),
  ];

  /// Font sizes the captions are drawn with (text scale applies on top).
  Set<double?> captionSizes(WidgetTester t) => {
        for (final of in [find.byType(PostBodyText), find.byType(FeedCaption)])
          for (final text in t.widgetList<Text>(
            find.descendant(of: of, matching: find.byType(Text)),
          ))
            (text.textSpan?.style ?? text.style)?.fontSize,
      };

  for (final theme in AppThemeId.values) {
    for (final (lang, translator, dir) in languages) {
      for (final MapEntry(key: kind, value: p) in posts.entries) {
        testWidgets('$kind caption is 14 (${theme.name}, $lang)', (t) async {
          t.view.physicalSize = const Size(360, 900);
          t.view.devicePixelRatio = 1;
          addTearDown(t.view.reset);
          await t.pumpWidget(
            uxApp(
              Directionality(
                textDirection: dir,
                child: Scaffold(
                  body: SingleChildScrollView(child: PostCard(post: p)),
                ),
              ),
              theme: AppTheme.of(theme),
              size: const Size(360, 900),
              textScale: 1.1,
              overrides: uxOverrides(translator: translator),
            ),
          );
          await t.pump();
          expect(t.takeException(), isNull);
          expect(captionSizes(t), {14.0});
          await t.pumpWidget(const SizedBox());
          await t.pump(const Duration(seconds: 30));
        });
      }
    }
  }

  testWidgets('a grid cover keeps an emoji title at the caption size',
      (t) async {
    for (final density in PostCoverDensity.values) {
      await t.pumpWidget(
        uxApp(
          Center(
            child: SizedBox.square(
              dimension: 120,
              child: PostTextCover(post: post(body: '😀'), density: density),
            ),
          ),
          theme: AppTheme.dark(),
          overrides: uxOverrides(translator: const StaticTranslatorRu()),
        ),
      );
      await t.pump();
      expect(t.takeException(), isNull);
      final title = t.widget<Text>(find.text('😀'));
      expect(title.style!.fontSize, 14);
    }
  });
}
