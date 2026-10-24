import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Owner 2026-10-23: the contacts search field («Поиск по контактам») was too
/// tall. The search-style AppTextField (`compact`) is 44 dp (the touch
/// target), the plain one is unchanged; the text and the icon stay centred
/// and nothing overflows at text scale 1.3.
/// The bordered box of the field (the Column around it fills the height).
final _box = find.descendant(
  of: find.byKey(const ValueKey('f')),
  matching:
      find.byWidgetPredicate((w) => w is Container && w.decoration != null),
);

void main() {
  Future<Size> size(
    WidgetTester tester, {
    required bool compact,
    double scale = 1,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: MediaQuery(
          data: MediaQueryData(textScaler: TextScaler.linear(scale)),
          child: Scaffold(
            body: Center(
              child: SizedBox(
                width: 320,
                child: AppTextField(
                  key: const ValueKey('f'),
                  compact: compact,
                  leading: const AppIcon(AppIcons.searchRounded),
                  hintText:
                      'Поиск по контактам и очень длинное описание поля поиска',
                ),
              ),
            ),
          ),
        ),
      ),
    );
    expect(tester.takeException(), isNull);
    return tester.getSize(_box);
  }

  testWidgets('the compact search field is 44 dp, about 15-20% lower', (
    tester,
  ) async {
    final tall = await size(tester, compact: false);
    final short = await size(tester, compact: true);
    expect(short.height, 44);
    expect(short.height, lessThan(tall.height));
    expect(short.height, greaterThanOrEqualTo(tall.height * 0.8 - 1));
    expect(short.width, tall.width);
  });

  testWidgets('text and icon are vertically centred', (tester) async {
    await size(tester, compact: true);
    final box = tester.getRect(_box);
    final icon = tester.getCenter(find.byType(AppIcon));
    final text = tester.getCenter(find.byType(EditableText));
    expect(icon.dy, closeTo(box.center.dy, 1.5));
    expect(text.dy, closeTo(box.center.dy, 1.5));
  });

  testWidgets('fits at text scale 1.3 without overflow', (tester) async {
    final s = await size(tester, compact: true, scale: 1.3);
    expect(s.height, greaterThanOrEqualTo(44));
    expect(s.height, lessThanOrEqualTo(52));
  });
}
