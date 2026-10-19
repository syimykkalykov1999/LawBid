import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/theme/app_theme.dart';
import 'package:lawbid/features/cases/workspace/compose_sheet.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-13: one compose widget for a task of a case and for the
/// Planner; the Planner has the calendar and the bell but no case kinds.
Future<void> main() async {
  for (final planner in [false, true]) {
    testWidgets('compose strip (${planner ? 'planner' : 'case task'})', (
      tester,
    ) async {
      await tester.pumpWidget(
        uxApp(
          Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => showComposeSheet(
                  context,
                  mode: planner ? ComposeMode.planner : ComposeMode.task,
                  isAttorney: !planner,
                  moreLabel: planner ? 'Details' : null,
                ),
                child: const Text('open'),
              ),
            ),
          ),
          theme: AppTheme.light(),
          size: const Size(360, 800),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      expect(find.byTooltip('Due date'), findsOneWidget);
      expect(find.byTooltip('Reminder'), findsOneWidget);
      expect(find.byTooltip('Checklist item'), findsOneWidget);
      // the kinds (For client · Progress · Joint · Private) are for a case
      // only; audit 2026-10-19: two of them were both called «Общие».
      expect(find.text('Progress'), planner ? findsNothing : findsOneWidget);
      expect(find.text('Joint'), planner ? findsNothing : findsOneWidget);
      expect(
        find.byTooltip('Details'),
        planner ? findsOneWidget : findsNothing,
      );
      expect(tester.takeException(), isNull);
    });
  }
}
