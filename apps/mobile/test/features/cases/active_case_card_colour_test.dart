import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/active_case_card.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-15: every «Active» card header took the gold fallback,
/// because the full practice code ("family_law.divorce") was looked up
/// in a table keyed by category. Different practices must differ.
void main() {
  Color headerOf(WidgetTester tester) {
    final containers = tester.widgetList<Container>(
      find.descendant(
        of: find.byType(ActiveCaseCard),
        matching: find.byType(Container),
      ),
    );
    final box = containers
        .map((c) => c.decoration)
        .whereType<BoxDecoration>()
        .firstWhere(
          (d) =>
              d.border is Border &&
              (d.border! as Border).bottom.width > 0 &&
              (d.border! as Border).top.width == 0,
        );
    return box.color!;
  }

  testWidgets('different practices give different header colours',
      (tester) async {
    final seen = <Color>{};
    for (final code in [
      'family_law.divorce',
      'immigration.green_card',
      'traffic_tickets.speeding',
      'real_estate.boundary_and_easement_disputes',
    ]) {
      await tester.pumpWidget(
        uxApp(
          Scaffold(
            body: ActiveCaseCard(
              title: 'T',
              practiceName: 'P',
              statusLabel: 'Open',
              statusTone: StatusTone.info,
              stage: 1,
              stageLabel: '2',
              next: 'n',
              practiceCode: code,
              onTap: () {},
            ),
          ),
          theme: AppTheme.light(),
        ),
      );
      seen.add(headerOf(tester));
    }
    expect(seen.length, 4);
  });
}
