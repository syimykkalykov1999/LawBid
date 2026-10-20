import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/team/presentation/task_board_widgets.dart';

import '../helpers/long_locale.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-20: a planner chip is never cut with «…» at 360 dp ×1.1.
void main() {
  testWidgets('chips in a scrolling row keep their whole label',
      (tester) async {
    useNarrowPhone(tester);
    const labels = ['Все', 'Просрочено', 'Для клиента', 'Совместные'];
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final l in labels)
                  MiniChip(label: l, selected: false, onTap: () {}),
              ],
            ),
          ),
        ),
        theme: AppTheme.light(),
        textScale: 1.1,
      ),
    );
    for (final l in labels) {
      final box = tester.renderObject<RenderParagraph>(find.text(l));
      expect(box.didExceedMaxLines, isFalse, reason: l);
      expect(box.size.width, greaterThan(0));
    }
    expect(tester.takeException(), isNull);
  });
}
