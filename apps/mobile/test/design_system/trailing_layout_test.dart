import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Owner 2026-10-05: on Settings the theme value and the "On" of the
/// activity-status row sat in the middle of the row and the label wrapped
/// at half width — an `Expanded` label next to a `Flexible` value split
/// the row in half. The value must hug the end edge and the label must get
/// the rest of the row, in short and long languages alike.
void main() {
  Future<void> pumpRows(WidgetTester tester, List<Widget> rows) async {
    tester.view
      ..devicePixelRatio = 3
      ..physicalSize = const Size(360, 780) * 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(16),
            child: AppListSection(children: rows),
          ),
        ),
      ),
    );
  }

  testWidgets('a short value hugs the end edge, next to the chevron',
      (tester) async {
    await pumpRows(tester, [
      AppListRow(
        icon: AppIcons.contrastRounded,
        label: 'Тема',
        trailingText: 'Тёмная',
        onTap: () {},
      ),
      AppListRow(
        icon: AppIcons.visibilityOutlined,
        label: 'Показывать статус активности',
        subtitle: 'Собеседники видят, когда вы в сети. Если выключить — '
            'вы тоже не будете видеть их статус.',
        trailingText: 'Вкл',
        showChevron: false,
        onTap: () {},
      ),
    ]);
    expect(tester.takeException(), isNull);

    final firstRow = tester.getRect(find.byType(AppListRow).first);
    final value = tester.getRect(find.text('Тёмная'));
    // Value + gap + chevron + row padding: the value ends near the edge
    // (it used to end around the middle of the row).
    expect(firstRow.right - value.right, lessThan(48));

    final secondRow = tester.getRect(find.byType(AppListRow).last);
    final on = tester.getRect(find.text('Вкл'));
    expect(secondRow.right - on.right, lessThan(AppSpacing.md + 1));

    // The label gets most of the row, not just half of it.
    final label = tester.getRect(find.text('Показывать статус активности'));
    expect(label.width, greaterThan(secondRow.width * 0.5));
  });

  testWidgets('a long value ellipsizes and leaves the label most of the row',
      (tester) async {
    const long = 'Automatisch entsprechend den Systemeinstellungen';
    await pumpRows(tester, [
      AppListRow(label: 'Theme', trailingText: long, onTap: () {}),
    ]);
    expect(tester.takeException(), isNull);
    expect(
      tester.getRect(find.text(long)).width,
      lessThanOrEqualTo(360 * 0.36 + 0.5),
    );
  });
}
