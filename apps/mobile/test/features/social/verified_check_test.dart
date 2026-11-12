import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/shared/people/people_suggest_list.dart';

/// Owner 2026-10-13: the only check is the client's gold one; attorneys have
/// none (their sign is the green Identity badge on the avatar).
/// Owner item 40 (24.10): the check looked grey in some themes; every
/// verified check draws the theme's [AppColorTokens.verifiedGold] in all 4.
void main() {
  Future<void> pump(
    WidgetTester tester, {
    required bool gold,
    AppThemeId theme = AppThemeId.day,
  }) =>
      tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.of(theme),
          home: Scaffold(body: VerifiedCheck(label: 'Verified', gold: gold)),
        ),
      );

  for (final id in AppThemeId.values) {
    testWidgets('${id.name}: a client with a subscription gets the gold check',
        (tester) async {
      await pump(tester, gold: true, theme: id);
      expect(find.byIcon(AppIcons.verifiedUserOutlined), findsOneWidget);
      final icon = tester.widget<Icon>(
        find.byIcon(AppIcons.verifiedUserOutlined),
      );
      final colors = AppTheme.of(id).extension<AppColorTokens>()!;
      expect(icon.color, colors.verifiedGold);
    });

    testWidgets('${id.name}: the people type-ahead check is the same gold',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.of(id),
          home: Scaffold(
            body: PersonSuggestionTile(
              person: const SuggestedPerson(
                id: 'u1',
                username: 'anna',
                name: 'Anna',
                verified: true,
              ),
              onTap: () {},
            ),
          ),
        ),
      );
      final colors = AppTheme.of(id).extension<AppColorTokens>()!;
      final icon = tester.widget<Icon>(find.byIcon(AppIcons.verifiedRounded));
      expect(icon.color, colors.verifiedGold);
    });
  }

  testWidgets('an attorney gets no check at all', (tester) async {
    await pump(tester, gold: false);
    expect(find.byIcon(AppIcons.verifiedUserOutlined), findsNothing);
  });
}
