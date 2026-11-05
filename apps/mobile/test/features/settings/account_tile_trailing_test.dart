import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/settings/account/presentation/widgets/account_tile.dart';

/// Owner 2026-11-05: on Settings → Account the «Изменить ›» of the phone
/// row stood in the middle of the card. The action label and chevron must
/// hug the end edge of the row (right in LTR, left in RTL), like the
/// chevrons of every other settings row.
void main() {
  Future<void> pumpTiles(
    WidgetTester tester, {
    TextDirection direction = TextDirection.ltr,
    String action = 'Изменить',
  }) async {
    tester.view
      ..devicePixelRatio = 3
      ..physicalSize = const Size(390, 844) * 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Directionality(
          textDirection: direction,
          child: Scaffold(
            body: Padding(
              padding: const EdgeInsets.all(16),
              child: AppListSection(
                children: [
                  AccountTile(
                    key: const ValueKey('phone'),
                    icon: AppIcons.phoneIphoneRounded,
                    title: 'Телефон',
                    subtitle: '(872) 272-0655',
                    badge: const AccountBadge(
                      label: 'Подтверждён',
                      tone: AccountBadgeTone.success,
                    ),
                    actionLabel: action,
                    onTap: () {},
                  ),
                  AccountTile(
                    key: const ValueKey('email'),
                    icon: AppIcons.alternateEmailRounded,
                    title: 'Эл. почта',
                    subtitle: 'someone@example.com',
                    actionLabel: action,
                    onTap: () {},
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  for (final key in ['phone', 'email']) {
    testWidgets('$key row: «Изменить ›» hugs the right edge (LTR)',
        (tester) async {
      await pumpTiles(tester);
      expect(tester.takeException(), isNull);
      final row = tester.getRect(find.byKey(ValueKey(key)));
      final label = tester.getRect(
        find.descendant(
          of: find.byKey(ValueKey(key)),
          matching: find.text('Изменить'),
        ),
      );
      // Label + gap + chevron + row padding only (it used to end near
      // the middle of the row).
      expect(row.right - label.right, lessThan(48));
      expect(label.left, greaterThan(row.center.dx));
    });

    testWidgets('$key row: the action sits at the end edge in RTL',
        (tester) async {
      await pumpTiles(tester, direction: TextDirection.rtl);
      expect(tester.takeException(), isNull);
      final row = tester.getRect(find.byKey(ValueKey(key)));
      final label = tester.getRect(
        find.descendant(
          of: find.byKey(ValueKey(key)),
          matching: find.text('Изменить'),
        ),
      );
      expect(label.left - row.left, lessThan(48));
      expect(label.right, lessThan(row.center.dx));
    });
  }

  testWidgets('a long action label ellipsizes instead of squeezing the title',
      (tester) async {
    const long = 'Telefonnummer ändern und bestätigen lassen';
    await pumpTiles(tester, action: long);
    expect(tester.takeException(), isNull);
    final label = tester.getRect(find.text(long).first);
    expect(label.width, lessThanOrEqualTo(390 * 0.36 + 0.5));
  });
}
