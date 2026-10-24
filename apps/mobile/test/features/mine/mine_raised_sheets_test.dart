import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/domain/case_urgency.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_header.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_urgency_picker.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_filter_sheet.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/task_links.dart';
import 'package:lawbid/shared/presentation/raised_sheet.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-24: every menu, picker and filter of «Мои» is a raised,
/// roomy sheet (handle, visible title, 30-60% of the screen).
void main() {
  setUpAll(initializeDateFormatting);

  Future<void> open(
    WidgetTester tester,
    Future<void> Function(BuildContext context, WidgetRef ref) launch, {
    ThemeData? theme,
  }) async {
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: Consumer(
            builder: (context, ref, _) => TextButton(
              onPressed: () => launch(context, ref),
              child: const Text('open'),
            ),
          ),
        ),
        theme: theme ?? AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
  }

  double screenHeight(WidgetTester tester) =>
      tester.view.physicalSize.height / tester.view.devicePixelRatio;

  /// The sheet is at least 30% and at most 60% of the screen tall.
  void expectRoomy(WidgetTester tester) {
    final h = screenHeight(tester);
    final box = tester.getRect(find.byType(RaisedSheetBody));
    expect(box.height, greaterThanOrEqualTo(h * 0.3 - 1));
    expect(box.height, lessThanOrEqualTo(h * 0.6 + 1));
    expect(find.byType(AppSheetHandle), findsOneWidget);
  }

  for (final (name, theme) in [
    ('day', AppTheme.light()),
    ('night', AppTheme.dark()),
  ]) {
    testWidgets('a raised choice sheet with a title closes on select ($name)',
        (tester) async {
      int? picked;
      await open(
        tester,
        (context, ref) async {
          picked = await showRaisedSheet<int>(
            context,
            title: 'Pick one',
            rows: (sheet) => [
              AppListRow(
                key: const ValueKey('row-0'),
                label: 'First',
                showChevron: false,
                onTap: () => Navigator.of(sheet).pop(0),
              ),
            ],
          );
        },
        theme: theme,
      );
      expect(find.text('Pick one'), findsOneWidget);
      expectRoomy(tester);
      await tester.tap(find.byKey(const ValueKey('row-0')));
      await tester.pumpAndSettle();
      expect(find.text('Pick one'), findsNothing);
      expect(picked, 0);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('the place menu is a raised sheet and closes on a choice',
      (tester) async {
    await open(
      tester,
      (context, ref) => showPlaceActions(
        context,
        ref.read(translatorProvider),
        const TaskPlace(address: '1 Main St', label: 'Court'),
      ),
    );
    expect(find.textContaining('1 Main St'), findsOneWidget);
    expectRoomy(tester);
    await tester.tap(find.byKey(const ValueKey('place-copy')));
    await tester.pumpAndSettle();
    expect(find.textContaining('1 Main St'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a case action menu is raised and closes on a choice',
      (tester) async {
    var done = false;
    await open(
      tester,
      (context, ref) async => showActionSheet(context, [
        ActionSheetItem(
          icon: AppIcons.checkRounded,
          label: 'Mark done',
          onTap: () => done = true,
        ),
      ]),
    );
    expect(find.text('Mark done'), findsOneWidget);
    expectRoomy(tester);
    await tester.tap(find.text('Mark done'));
    await tester.pumpAndSettle();
    expect(find.text('Mark done'), findsNothing);
    expect(done, isTrue);
  });

  testWidgets('the questions filter sheet is raised with its title',
      (tester) async {
    QuestionsQuery? result;
    await open(
      tester,
      (context, ref) async {
        result = await showQaFilterSheet(
          context,
          current: const QuestionsQuery(),
          attorney: false,
        );
      },
    );
    expect(find.text('Filters'), findsOneWidget);
    final h = screenHeight(tester);
    expect(find.byType(AppSheetHandle), findsOneWidget);
    expect(
      tester.getRect(find.byType(AppSheetHandle)).top,
      lessThan(h * 0.75),
    );
    await tester.tap(find.byType(AppButton));
    await tester.pumpAndSettle();
    expect(find.text('Filters'), findsNothing);
    expect(result, isNotNull);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the date (urgency) sheet is raised and closes by a tap outside',
      (tester) async {
    await open(
      tester,
      (context, ref) async {
        await showCaseUrgencySheet(
          context,
          caseId: 'c1',
          current: CaseUrgencyInfo.none,
        );
      },
    );
    final h = screenHeight(tester);
    expect(find.byType(AppSheetHandle), findsOneWidget);
    expect(
      tester.getRect(find.byType(AppSheetHandle)).top,
      lessThan(h * 0.75),
    );
    // A tap on the dimmed area above the sheet closes it.
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();
    expect(find.byType(AppSheetHandle), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
