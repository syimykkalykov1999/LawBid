import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:material_ui/material_ui.dart';

void main() {
  testWidgets('a long label wraps/ellipsizes instead of overflowing',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: const Scaffold(
          body: SizedBox(
            width: 160,
            child: Wrap(
              children: [
                AppChip(
                  label: 'Приостановление и лишение водительских прав',
                  selected: true,
                ),
              ],
            ),
          ),
        ),
      ),
    );
    expect(tester.takeException(), isNull);
  });
}
