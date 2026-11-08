import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/default_feature_flags.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';
import 'package:lawbid/features/cases/domain/case_draft.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_wizard_steps.dart';

import '../../helpers/onboarding_harness.dart';
import '../profile/profile_fakes.dart';
import 'cases_fakes.dart';

class _Flags extends FeatureFlagsController {
  @override
  FeatureFlagsState build() => const FeatureFlagsState(
        flags: {...defaultFeatureFlags},
        appConfig: {'fees.contingency_blocked_practices': 'family_law'},
      );

  @override
  Future<void> refreshInBackground({
    String? knownVersion,
    Map<String, bool>? flags,
  }) async {}
}

/// Owner 2026-11-07 (prototype B): the client's budget step is a row of
/// tiles, «Позже» chosen first; «Процент» is hidden in banned topics.
void main() {
  setUpAll(() async => initializeDateFormatting('en'));

  Finder key(String k) => find.byKey(ValueKey(k));

  late CaseDraft draft;

  Future<void> pump(WidgetTester t, {String practice = 'immigration'}) async {
    t.view.physicalSize = const Size(390, 2200);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    draft = completeDraft().copyWith(practiceCode: practice);
    final wrap = await onboardingWrapper(
      AppTheme.light(),
      user: clientMe(),
      extra: <Override>[
        ...casesOverrides(),
        featureFlagsControllerProvider.overrideWith(_Flags.new),
      ],
    );
    await t.pumpWidget(
      wrap(
        StatefulBuilder(
          builder: (context, set) => Scaffold(
            body: BudgetStep(
              draft: draft,
              onChange: (f) => set(() => draft = f(draft)),
            ),
          ),
        ),
      ),
    );
    await t.pump();
    await t.pump(const Duration(milliseconds: 300));
  }

  Future<void> tap(WidgetTester t, String name) async {
    await t.tap(key('pay-tile-$name'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 400));
  }

  testWidgets('three tiles, «Позже» chosen, its hint under them', (t) async {
    await pump(t);
    expect(key('pay-tile-later'), findsOneWidget);
    expect(key('pay-tile-amount'), findsOneWidget);
    expect(key('pay-tile-percent'), findsOneWidget);
    expect(find.text('Later'), findsOneWidget);
    expect(find.text('Amount'), findsOneWidget);
    expect(find.text('Percent'), findsOneWidget);
    expect(find.text('Agree on payment later'), findsOneWidget);
    expect(key('amount-field'), findsNothing);
    expect(draft.budgetIsAmount, isFalse);
    expect(draft.budgetIsPercent, isFalse);
  });

  testWidgets('«Сумма» shows the amount field and the draft follows',
      (t) async {
    await pump(t);
    await tap(t, 'amount');
    expect(draft.budgetIsAmount, isTrue);
    expect(find.text('One sum for the whole job'), findsOneWidget);
    await t.enterText(
      find.descendant(
        of: key('amount-field'),
        matching: find.byType(EditableText),
      ),
      '2500',
    );
    await t.pump();
    expect(draft.budgetDollars, 2500);
    expect(draft.budgetValid, isTrue);
  });

  testWidgets('«Процент» shows the percent field and the draft follows',
      (t) async {
    await pump(t);
    await tap(t, 'percent');
    expect(draft.budgetIsPercent, isTrue);
    await t.enterText(
      find.descendant(
        of: key('percent'),
        matching: find.byType(EditableText),
      ),
      '33',
    );
    await t.pump();
    expect(draft.budgetPercentBps, 3300);
    // Back to «Позже»: both choices are off again.
    await tap(t, 'later');
    expect(draft.budgetIsAmount, isFalse);
    expect(draft.budgetIsPercent, isFalse);
  });

  testWidgets('a banned topic: two tiles and the old line', (t) async {
    await pump(t, practice: 'family_law');
    expect(key('pay-tile-percent'), findsNothing);
    expect(key('pay-tile-later'), findsOneWidget);
    expect(key('pay-tile-amount'), findsOneWidget);
    expect(key('budget-percent-forbidden'), findsOneWidget);
  });
}
