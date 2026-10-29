import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/features/reels/application/reel_publish_job.dart';
import 'package:lawbid/features/reels/presentation/reel_publish_card.dart';

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

Future<void> _pump(WidgetTester tester, ReelPublishState s) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        translatorProvider.overrideWithValue(
          L10nTranslator(language: AppLanguage.ru, cache: const {}),
        ),
        reelPublishJobProvider.overrideWith(() => _Job(s)),
      ],
      child: MaterialApp(
        theme: AppTheme.of(AppThemeId.green),
        home: const Scaffold(body: ReelPublishCard()),
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 400));
}

/// Owner 2026-10-28: the banner's fill is anchored to the left and equals
/// the percent; it leaves once the video is uploaded; a failed one stays.
void main() {
  testWidgets('upload: fill from the left equals the percent', (tester) async {
    await _pump(
      tester,
      const ReelPublishState(phase: ReelPublishPhase.uploading, progress: 0.5),
    );
    final bar = tester.widget<LinearProgressIndicator>(
      find.byType(LinearProgressIndicator),
    );
    expect(bar.value, isNotNull);
    expect(bar.value, closeTo(0.5, 0.2));
    expect(find.textContaining('загрузить публикацию'), findsOneWidget);
  });

  testWidgets('posting: determinate and full, not an endless slider', (
    tester,
  ) async {
    await _pump(
      tester,
      const ReelPublishState(phase: ReelPublishPhase.posting, progress: 1),
    );
    final bar = tester.widget<LinearProgressIndicator>(
      find.byType(LinearProgressIndicator),
    );
    expect(bar.value, 1.0);
    expect(find.text('100%'), findsOneWidget);
  });

  for (final phase in [ReelPublishPhase.processing, ReelPublishPhase.done]) {
    testWidgets('${phase.name}: the banner is gone', (tester) async {
      await _pump(tester, ReelPublishState(phase: phase, progress: 1));
      expect(find.byKey(const ValueKey('reel-publish-card')), findsNothing);
      expect(find.byType(LinearProgressIndicator), findsNothing);
    });
  }

  testWidgets('failed: stays with Retry', (tester) async {
    await _pump(tester, const ReelPublishState(phase: ReelPublishPhase.failed));
    expect(find.byKey(const ValueKey('reel-publish-card')), findsOneWidget);
    expect(find.text('Повторить'), findsOneWidget);
  });
}
