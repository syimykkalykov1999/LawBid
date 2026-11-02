import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/reels/application/reel_publish_job.dart';
import 'package:lawbid/features/reels/presentation/reel_publish_card.dart';

import '../helpers/long_locale.dart';

/// Owner 2026-10-23: the publish card at the top of the feed is full width
/// and compact: the «keep LawBid open» line on top, the progress bar with
/// its percent below, the thumbnail and the cancel «×» kept.
class _Job extends ReelPublishJob {
  _Job(this._state);
  final ReelPublishState _state;

  @override
  ReelPublishState build() => _state;

  @override
  void cancel() {}

  @override
  void dismiss() {}
}

void main() {
  final locales = <String, (Translator, TextDirection)>{
    'longest': (LongestTranslator(), TextDirection.ltr),
    'longest rtl': (LongestTranslator(), TextDirection.rtl),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
  };
  for (final scale in [1.0, 1.3]) {
    for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
      for (final phase in [
        ReelPublishPhase.uploading,
        ReelPublishPhase.processing,
        ReelPublishPhase.failed,
      ]) {
        testWidgets('card: no overflow ($name, x$scale, ${phase.name})', (
          tester,
        ) async {
          useNarrowPhone(tester);
          await tester.pumpWidget(
            ProviderScope(
              overrides: [
                translatorProvider.overrideWithValue(t),
                reelPublishJobProvider.overrideWith(
                  () => _Job(ReelPublishState(phase: phase, progress: 0.91)),
                ),
              ],
              child: MaterialApp(
                theme: AppTheme.of(AppThemeId.green),
                builder: (context, child) => Directionality(
                  textDirection: dir,
                  child: MediaQuery(
                    data: MediaQuery.of(context).copyWith(
                      textScaler: TextScaler.linear(scale),
                    ),
                    child: child!,
                  ),
                ),
                home: const Scaffold(body: ReelPublishCard()),
              ),
            ),
          );
          await tester.pump(const Duration(milliseconds: 400));
          expect(tester.takeException(), isNull);
          final box = tester.getRect(find.byType(ReelPublishCard));
          // Owner 2026-10-28: once uploaded (processing) the banner is gone.
          if (phase == ReelPublishPhase.processing) {
            expect(box.width, 0);
            await tester.pumpWidget(const SizedBox());
            return;
          }
          expect(box.width, 360, reason: 'full width');
          if (phase == ReelPublishPhase.uploading && scale == 1.0) {
            expect(box.height, lessThan(80), reason: 'compact');
            expect(find.text('91%'), findsOneWidget);
            expect(find.text(t.t('reels.keepOpen')), findsOneWidget);
          }
          await tester.pumpWidget(const SizedBox());
        });
      }
    }
  }
}
