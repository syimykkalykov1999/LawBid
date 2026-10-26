import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cards.dart';
import 'package:lawbid/features/promotions/presentation/promote_case_card.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

import '../helpers/long_locale.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-14: the action row, the case card and the Boost header at
/// 360 dp in German and Arabic (mirrored), with the longest translation of
/// every key and huge counters; any overflow fails the test.
class _Worst implements Translator {
  _Worst();
  final _base = LongestTranslator();

  // A long "Bid ✓" of the shipped languages (the workbook tool can't run
  // here, so the longest value of the new key is pinned).
  static const _long = {'cases.card.bidDone': 'Propuesta enviada ✓'};

  @override
  String t(String key, [Map<String, String>? params]) =>
      _long[key] ?? _base.t(key, params);

  @override
  String plural(String key, num count, [Map<String, String>? params]) =>
      _base.plural(key, count, params);
}

Future<void> main() async {
  await initializeDateFormatting();

  Post post() => Post(
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
        shareCount: 15400000,
        viewCount: 3400000000,
        likedByMe: false,
        savedByMe: false,
        isMine: true,
        createdAt: DateTime.now().subtract(const Duration(days: 2)),
        video: const PostVideo(status: 'ready'),
      );

  FeedCase kase({required bool bid}) => FeedCase(
        id: 'case-1',
        title: 'Speeding ticket',
        practice: const PracticeRef(
          id: 'p1',
          code: 'general_practice.not_sure_or_other',
          i18nKey: 'practice.general_practice.not_sure_or_other',
          nameEn: 'Not sure',
        ),
        primaryStateCode: 'CA',
        additionalStateCodes: const [],
        city: null,
        status: CaseStatus.open,
        budget: const CaseBudget(mode: BudgetMode.clarifyLater),
        viewCount: 1,
        bidsCount: 1200000,
        createdAt: DateTime.now().subtract(const Duration(hours: 4)),
        isNew: false,
        hasOwnBid: bid,
        description: 'A ticket on I-5, need help.',
      );

  for (final (code, dir) in const [
    ('de', TextDirection.ltr),
    ('ar', TextDirection.rtl),
  ]) {
    final formats = L10nFormats(AppLanguage.fromCode(code));

    Future<void> pump(WidgetTester t, Widget child) async {
      useNarrowPhone(t);
      await t.pumpWidget(
        uxApp(
          Directionality(textDirection: dir, child: Scaffold(body: child)),
          theme: AppTheme.dark(),
          size: narrowPhone,
          overrides: uxOverrides(
            translator: _Worst(),
            extra: [l10nFormatsProvider.overrideWithValue(formats)],
          ),
        ),
      );
      await t.pump();
      expect(t.takeException(), isNull);
    }

    testWidgets('action row, video post, $code', (t) async {
      await pump(
        t,
        PostActionsBar(
          post: post(),
          run: (f) async => f(),
          showTime: true,
        ),
      );
      final box = t.getRect(find.byType(PostActionsBar));
      expect(box.right, lessThanOrEqualTo(360));
      expect(box.left, greaterThanOrEqualTo(0));
    });

    for (final bid in [false, true]) {
      testWidgets('case card, bid placed: $bid, $code', (t) async {
        await pump(
          t,
          SingleChildScrollView(
            child: FeedCaseCard(
              item: kase(bid: bid),
              t: _Worst(),
              formats: formats,
              onTap: () {},
            ),
          ),
        );
        final card = t.getRect(find.byType(FeedCaseCard));
        expect(card.right, lessThanOrEqualTo(360));
      });
    }

    testWidgets('Boost header on my post, $code', (t) async {
      await pump(
        t,
        AuthorHeader(
          author: post().author,
          subtitle: 'Licensed attorney in a very long place name, California',
          showFollow: false,
          boostPostId: 'p1',
        ),
      );
      expect(find.byType(BoostButton), findsOneWidget);
      await t.pumpWidget(const SizedBox());
      await t.pump(const Duration(seconds: 10));
    });
  }
}
