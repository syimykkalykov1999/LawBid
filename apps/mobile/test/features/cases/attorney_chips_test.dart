import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/screens/mine_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/mine/presentation/widgets/mine_grid.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

/// Owner 2026-10-23: the attorney's Cases chips are four on ONE row
/// (Active · Bids · Invitations · Done); the old «Waiting for a reply» chip
/// is the Bids chip. The chips scroll left of the two pinned icons.
void main() {
  test('old filter ids land on the chip that holds them now', () {
    expect(
      AttorneyCasesSection.fromLegacy('active'),
      AttorneyCasesSection.active,
    );
    expect(AttorneyCasesSection.fromLegacy('bids'), AttorneyCasesSection.bids);
    // «Ждут ответа» was a second row under Bids: the same list as Bids.
    expect(
      AttorneyCasesSection.fromLegacy('waiting'),
      AttorneyCasesSection.bids,
    );
    expect(
      AttorneyCasesSection.fromLegacy('invites'),
      AttorneyCasesSection.invites,
    );
    expect(
      AttorneyCasesSection.fromLegacy('completed'),
      AttorneyCasesSection.completed,
    );
    expect(AttorneyCasesSection.fromLegacy('nope'), isNull);
    // Nothing reachable before is lost: four chips, four sections.
    expect(AttorneyCasesSection.values, hasLength(4));
  });

  for (final width in [320.0, 360.0]) {
    testWidgets(
        'four chips and two icons: one row, no overlap '
        '(longest, x1.3, ${width.toInt()} dp)', (tester) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = Size(width, 700);
      addTearDown(tester.view.reset);
      final t = LongestTranslator();
      var section = AttorneyCasesSection.active;
      await tester.pumpWidget(
        uxApp(
          StatefulBuilder(
            builder: (context, setState) => Scaffold(
              body: MineChipsSearchRow(
                search: const MineSearch(),
                onChanged: (_) {},
                action: AppIconButton(
                  key: const ValueKey('bookmark'),
                  compact: true,
                  icon: const AppIcon(AppIcons.bookmarkBorderRounded),
                  semanticLabel: 'saved',
                  onPressed: () {},
                ),
                chips: FilterChips<AttorneyCasesSection>(
                  key: const ValueKey('bids-sections'),
                  compact: true,
                  padding: EdgeInsets.zero,
                  value: section,
                  options: [
                    (AttorneyCasesSection.active, t.t('mine.filter.active')),
                    (AttorneyCasesSection.bids, t.t('mine.bids.title')),
                    (AttorneyCasesSection.invites, t.t('invites.section')),
                    (AttorneyCasesSection.completed, t.t('mine.chip.done')),
                  ],
                  onChanged: (v) => setState(() => section = v),
                ),
              ),
            ),
          ),
          theme: AppTheme.light(),
          size: Size(width, 700),
          textScale: 1.3,
          overrides: uxOverrides(translator: t),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      final chips = tester.getRect(find.byKey(const ValueKey('bids-sections')));
      final search =
          tester.getRect(find.byKey(const ValueKey('mine-search-open')));
      final bookmark = tester.getRect(find.byKey(const ValueKey('bookmark')));
      // One row: the strip, the magnifier and the bookmark share a line, and
      // the strip ends before the icons begin.
      expect((chips.center.dy - search.center.dy).abs(), lessThan(6));
      expect(chips.right, lessThanOrEqualTo(search.left + 0.5));
      expect(search.right, lessThanOrEqualTo(bookmark.left + 0.5));
      expect(bookmark.right, lessThanOrEqualTo(width));
      // The strip scrolls; a tap on a chip far to the right reaches it.
      await tester.drag(
        find.byKey(const ValueKey('bids-sections')),
        const Offset(-300, 0),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }
}
