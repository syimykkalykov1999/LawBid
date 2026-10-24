import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';

void main() {
  testWidgets('tapAnywhere: a tap in the box padding focuses the field',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: const Scaffold(
          body: Center(
            child: AppTextField(
              key: ValueKey('f'),
              maxLines: 3,
              tapAnywhere: true,
            ),
          ),
        ),
      ),
    );
    final text = tester.getRect(find.byType(TextField));
    // Left of the text, in the padding of the box.
    await tester.tapAt(Offset(text.left - 6, text.center.dy));
    await tester.pump();
    final focus = tester.widget<TextField>(find.byType(TextField)).focusNode!;
    expect(focus.hasFocus, isTrue);
  });
}
