import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

/// Owner 2026-10-13: the only check is the client's gold one; attorneys have
/// none (their sign is the green Identity badge on the avatar).
void main() {
  Future<void> pump(WidgetTester tester, {required bool gold}) =>
      tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(body: VerifiedCheck(label: 'Verified', gold: gold)),
        ),
      );

  testWidgets('a client with a subscription gets the gold check',
      (tester) async {
    await pump(tester, gold: true);
    expect(find.byIcon(AppIcons.verifiedUserOutlined), findsOneWidget);
    final icon = tester.widget<Icon>(
      find.byIcon(AppIcons.verifiedUserOutlined),
    );
    final colors = AppTheme.light().extension<AppColorTokens>()!;
    expect(icon.color, colors.goldAccent);
  });

  testWidgets('an attorney gets no check at all', (tester) async {
    await pump(tester, gold: false);
    expect(find.byIcon(AppIcons.verifiedUserOutlined), findsNothing);
  });
}
