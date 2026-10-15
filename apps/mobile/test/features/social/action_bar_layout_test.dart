import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/promotions/presentation/promote_case_card.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-14: the action bar is Instagram-sized, the views come
/// first, the date is always there, Boost sits in the header's Follow slot
/// on my own items, and big numbers are compact and localized.
void main() {
  setUpAll(initializeDateFormatting);

  Post post({required bool mine, bool video = false}) => Post(
        id: 'p1',
        author: const PostAuthor(
          id: 'a1',
          username: 'sofia.hernandez',
          firstName: 'Sofia',
          lastName: 'Hernandez',
          verified: true,
        ),
        title: 'Reel',
        body: 'Text',
        media: const [],
        tags: const [],
        likeCount: 215000,
        commentCount: 1200000,
        shareCount: 15400,
        viewCount: 3400000,
        likedByMe: false,
        savedByMe: false,
        isMine: mine,
        createdAt: DateTime.now().subtract(const Duration(days: 2)),
        video: video ? const PostVideo(status: 'ready') : null,
      );

  test('compact counters are localized', () {
    String c(String code, int n) =>
        SocialFormat.count(L10nFormats(AppLanguage.fromCode(code)), n);
    expect(c('en', 15000), '15K');
    expect(c('en', 1200000), '1.2M');
    expect(c('ru', 15000), contains('тыс'));
    expect(c('ru', 1200000), contains('млн'));
    expect(c('de', 1200000), contains('Mio'));
    expect(c('ar', 15000), isNot(contains('15000')));
    expect(c('en', 999), '999');
  });

  for (final translator in [
    const StaticTranslatorEn(),
    const StaticTranslatorRu(),
  ]) {
    testWidgets(
        'video post bar at 360dp: no views, no like/send counts, date shown, no Boost',
        (
      t,
    ) async {
      t.view.physicalSize = const Size(360, 740);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      await t.pumpWidget(
        uxApp(
          Scaffold(
            body: PostActionsBar(
              post: post(mine: true, video: true),
              run: (f) async => f(),
              showTime: true,
            ),
          ),
          theme: AppTheme.dark(),
          size: const Size(360, 740),
          overrides: uxOverrides(translator: translator),
        ),
      );
      await t.pump();
      expect(t.takeException(), isNull);
      // Owner 2026-10-15: no views counter on feed cards; no count next to
      // like or send, the comment count stays.
      expect(find.byIcon(AppIcons.visibilityOutlined), findsNothing);
      expect(find.text('215K'), findsNothing);
      expect(find.text('15K'), findsNothing);
      expect(find.text('1.2M'), findsOneWidget);
      expect(find.byType(BoostButton), findsNothing);
      expect(
        find.text(
          SocialFormat.shortDate(
            translator,
            L10nFormats(AppLanguage.fallback),
            post(mine: false).createdAt,
          ),
        ),
        findsOneWidget,
      );
      // Instagram size: 22dp icons, the bookmark 24.
      final like = t.getSize(find.byIcon(AppIcons.favoriteBorderRounded)).width;
      final save = t.getSize(find.byIcon(AppIcons.bookmarkBorderRounded)).width;
      expect(like, 22);
      expect(save, greaterThan(like));
      expect(save - like, lessThanOrEqualTo(3));
    });
  }

  testWidgets('Boost sits in the Follow slot on my own post only', (t) async {
    t.view.physicalSize = const Size(360, 740);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    Future<void> pump({required bool mine}) => t.pumpWidget(
          uxApp(
            Scaffold(
              body: AuthorHeader(
                author: post(mine: false).author,
                subtitle: 'sub',
                showFollow: !mine,
                boostPostId: mine ? 'p1' : null,
              ),
            ),
            theme: AppTheme.dark(),
            size: const Size(360, 740),
            overrides: uxOverrides(),
          ),
        );
    await pump(mine: true);
    await t.pump();
    expect(t.takeException(), isNull);
    expect(find.byType(BoostButton), findsOneWidget);
    await pump(mine: false);
    await t.pump();
    expect(find.byType(BoostButton), findsNothing);
    await t.pumpWidget(const SizedBox());
    await t.pump(const Duration(seconds: 10));
  });
}
