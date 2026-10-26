import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/team/presentation/action_group.dart';

import '../helpers/long_locale.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-20: the planner card's buttons sit in grouped rows; in the
/// longest languages at 360 dp they fall back to pairs, never overflow and
/// never wrap a label.
void main() {
  final locales = <String, (Translator, TextDirection)>{
    'longest': (LongestTranslator(), TextDirection.ltr),
    'longest rtl': (LongestTranslator(), TextDirection.rtl),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'de': (ShippedTranslator('de'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
    'mr': (ShippedTranslator('mr'), TextDirection.ltr),
  };
  for (final scale in [1.0, 1.1]) {
    for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
      testWidgets('task card buttons at 360 dp ($name, x$scale)',
          (tester) async {
        useNarrowPhone(tester);
        GroupAction a(String k, String key) =>
            GroupAction(keyName: k, label: t.t(key), onPressed: () {});
        await tester.pumpWidget(
          uxApp(
            Directionality(
              textDirection: dir,
              child: Scaffold(
                body: Padding(
                  padding: const EdgeInsets.all(AppSpacing.screenSide),
                  child: Column(
                    children: [
                      ActionGroup(
                        actions: [
                          a('take', 'tasks.take'),
                          a('done', 'tasks.done'),
                          a('notDone', 'tasks.notDone'),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      ActionGroup(
                        actions: [
                          a('edit', 'tasks.edit'),
                          a('delete', 'tasks.delete'),
                          a('cancel', 'tasks.cancel'),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
            theme: AppTheme.light(),
            textScale: scale,
          ),
        );
        await tester.pump();
        expect(tester.takeException(), isNull);
      });
    }
  }
}
