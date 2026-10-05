import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/search/presentation/widgets/search_tiles.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart';
import 'package:lawbid/features/social/presentation/widgets/post_text_cover.dart';

import '../../helpers/ux_harness.dart';

/// Russian UI; practice names come from the server bundle, so a missing
/// key falls back like production does.
class StaticRuLenient extends StaticTranslatorRu {
  const StaticRuLenient();

  @override
  String t(String key, [Map<String, String>? params]) =>
      seedEntries.containsKey(key) ? super.t(key, params) : key;
}

Post textPost(
  String id,
  String title, {
  String body = '',
  PostPractice? practice,
  bool news = false,
  String? firstName = 'Chris',
}) =>
    Post(
      id: id,
      author: PostAuthor(
        id: 'a-$id',
        username: 'chris.walker',
        firstName: firstName,
        lastName: firstName == null ? null : 'Walker',
        verified: true,
      ),
      title: title,
      body: body,
      media: const [],
      tags: const [],
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
      savedByMe: false,
      isMine: false,
      isNews: news,
      practice: practice,
      createdAt: DateTime(2026, 10, 5),
    );

const family = PostPractice(
  code: 'family_law',
  categoryCode: 'family_law',
  nameEn: 'Family Law',
  i18nKey: 'practice.family_law',
);

final posts = [
  textPost('p-hhs', 'hhs'),
  textPost('p-wtf', 'wtf', firstName: null),
  textPost(
    'p-cook',
    'Cook County courts updated the parenting-time guidelines',
    body: 'What changes for parents filing after October 1 and how to '
        'prepare your schedule before the first hearing.',
    practice: family,
  ),
  textPost(
    'p-div',
    'An uncontested divorce in Cook County often takes less time than you '
        'think — here is a realistic timeline from filing to judgment',
    body: 'Most couples underestimate the paperwork.',
    news: true,
  ),
];

Widget grid({required bool compact}) => GridView.count(
      padding: const EdgeInsets.all(8),
      crossAxisCount: compact ? 3 : 2,
      mainAxisSpacing: 8,
      crossAxisSpacing: 8,
      childAspectRatio: compact ? 1 : 0.8,
      children: [
        for (final p in posts)
          if (compact)
            PostTextCover(post: p, density: PostCoverDensity.compact)
          else
            SearchPostTile(post: p),
      ],
    );

void main() {
  for (final (name, theme) in [
    ('light', AppTheme.light()),
    ('dark', AppTheme.dark()),
  ]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('text-only post covers fit ($name, x$scale)', (t) async {
        for (final compact in [false, true]) {
          await t.pumpWidget(
            uxApp(
              Scaffold(body: grid(compact: compact)),
              theme: theme,
              textScale: scale,
              overrides: uxOverrides(translator: const StaticRuLenient()),
            ),
          );
          await t.pump();
          expect(t.takeException(), isNull);
          expect(find.byType(BrandPattern), findsNWidgets(posts.length));
          // The title is the cover; no giant practice glyph.
          expect(find.textContaining('hhs'), findsWidgets);
        }
      });
    }
  }

  test('patterns differ across ids and are stable', () {
    final variants = {
      for (var i = 0; i < 40; i++) brandPatternVariant('post-$i'),
    };
    expect(variants.length, kBrandPatternVariants);
    expect(brandPatternVariant('p-hhs'), brandPatternVariant('p-hhs'));
  });

  test('avatar initials never show the @ of a handle', () {
    expect(avatarInitials('Chris Walker'), 'CW');
    expect(avatarInitials('@sima'), 'S');
    expect(avatarInitials('@chris.walker'), 'CW');
    expect(avatarInitials(''), '?');
  });

  testWidgets('people without photo or practice: initials, no empty line',
      (t) async {
    const row = AttorneyRow(
      id: 'x',
      username: 'sima',
      verified: false,
      ratingAvg: 0,
      ratingCount: 0,
      states: [],
      practiceKeys: [],
      isFollowing: false,
    );
    await t.pumpWidget(
      uxApp(
        const Scaffold(body: AttorneyTile(row: row, showFollow: false)),
        theme: AppTheme.dark(),
        overrides: uxOverrides(),
      ),
    );
    expect(find.text('S'), findsOneWidget);
    expect(find.text('@'), findsNothing);
  });
}
