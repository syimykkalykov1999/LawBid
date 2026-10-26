import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/shell/bottom_nav_config.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

import '../features/social/social_fakes.dart';
import '../helpers/long_locale.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-20: the post card (icons row, «N отметок», emoji posts) and
/// the bottom nav on a 360 dp phone in de, ru, ne, mr and ar (right-to-left),
/// at text scale 1.0, 1.1 and 1.3, in the worst case of all languages too. Any
/// RenderFlex overflow fails the test.
void main() {
  setUpAll(initializeDateFormatting);

  final locales = <String, (Translator, TextDirection)>{
    'longest': (LongestTranslator(), TextDirection.ltr),
    'longest rtl': (LongestTranslator(), TextDirection.rtl),
    'de': (ShippedTranslator('de'), TextDirection.ltr),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'mr': (ShippedTranslator('mr'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
  };

  for (final e in locales.entries) {
    for (final scale in [1.0, 1.1, 1.3]) {
      testWidgets('post cards and nav: ${e.key} x$scale', (t) async {
        useNarrowPhone(t);
        final (tr, dir) = e.value;
        final posts = [
          // The feed card with a photo, a big number of likes and comments.
          fakePost('p1', liked: true, likes: 1234567, withPhoto: true)
              .copyWith(commentCount: 98765),
          // One emoji: drawn big.
          fakePost('p2', likes: 3, withPhoto: true).copyWith(body: '😎'),
          // Without a photo: the Threads-style card.
          fakePost('p3', likes: 12).copyWith(
            body: 'Know your rights when stopped by the police at night.',
          ),
        ];
        await t.pumpWidget(
          uxApp(
            Directionality(
              textDirection: dir,
              child: Scaffold(
                body: SingleChildScrollView(
                  child: Column(
                    children: [for (final p in posts) PostCard(post: p)],
                  ),
                ),
                bottomNavigationBar: AppBottomNav(
                  tabs: tabsForRole(null, tr),
                  currentIndex: 0,
                  onTabSelected: (_) {},
                  onCreatePressed: () {},
                ),
              ),
            ),
            theme: AppTheme.light(),
            size: narrowPhone,
            textScale: scale,
            disableAnimations: true,
            overrides: uxOverrides(
              translator: tr,
              social: FakeSocialRepository(),
            ),
          ),
        );
        await t.pump(const Duration(seconds: 1));
        await t.pumpWidget(const SizedBox());
        await t.pump(const Duration(seconds: 30));
      });
    }
    // The likers list: a 30-character name next to «Follow» on the longest
    // text of each language.
    for (final scale in [1.0, 1.1, 1.3]) {
      testWidgets('likers list: ${e.key} x$scale', (t) async {
        useNarrowPhone(t);
        final (tr, dir) = e.value;
        final repo = FakeSocialRepository()
          ..likers = [
            for (var i = 0; i < 3; i++)
              PersonRow.attorney(
                AttorneyRow(
                  id: 'a$i',
                  username: 'maximilian_alexander_$i',
                  firstName: 'Maximilian-Alexander',
                  lastName: 'Montgomery',
                  verified: true,
                  ratingAvg: 4.8,
                  ratingCount: 12,
                  states: const ['NY', 'CA'],
                  practiceKeys: const ['practice.immigration'],
                  isFollowing: i == 1,
                ),
              ),
          ];
        await t.pumpWidget(
          uxApp(
            Directionality(
              textDirection: dir,
              child: const LikersScreen(postId: 'p1'),
            ),
            theme: AppTheme.light(),
            size: narrowPhone,
            textScale: scale,
            disableAnimations: true,
            overrides: uxOverrides(translator: tr, social: repo),
          ),
        );
        await t.pump(const Duration(seconds: 1));
        await t.pumpWidget(const SizedBox());
        await t.pump(const Duration(seconds: 30));
      });
    }
  }
}
