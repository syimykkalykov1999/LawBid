import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/theme/app_theme.dart';
import 'package:lawbid/core/text/bidi.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-12: the counter follows the limit (5000 for a thread, 2200
/// with files); over it the counter is red and the hint tells why.
/// Owner 2026-10-19: the counter sits inside the field, bottom right.
void main() {
  testWidgets('the counter shows the limit and the hint only when over it', (
    tester,
  ) async {
    final c = TextEditingController(text: 'a' * 2300);
    addTearDown(c.dispose);
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: PostTextField(
            controller: c,
            limitHint: 'Without photo or video up to 3000 characters',
          ),
        ),
        theme: AppTheme.light(),
      ),
    );
    await tester.pump();
    expect(find.text(ltrIsolate('2300/2200')), findsOneWidget);
    final field = tester.getRect(find.byType(TextField));
    final counter = tester.getRect(find.text(ltrIsolate('2300/2200')));
    expect(field.contains(counter.bottomRight - const Offset(1, 1)), isTrue);
    expect(field.contains(counter.topLeft), isTrue);
    expect(counter.right, greaterThan(field.center.dx));
    expect(
      find.text('Without photo or video up to 3000 characters'),
      findsOneWidget,
    );
    c.text = 'a' * 100;
    await tester.pump();
    expect(find.text(ltrIsolate('100/2200')), findsOneWidget);
    expect(
      find.text('Without photo or video up to 3000 characters'),
      findsNothing,
    );
  });
}
