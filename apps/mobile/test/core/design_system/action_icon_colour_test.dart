import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/icons/app_icons.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

// WCAG 2.x 1.4.11 Non-text Contrast: graphical objects need >= 3:1.
double _lum(Color c) {
  double ch(double v) =>
      v <= 0.03928 ? v / 12.92 : math.pow((v + 0.055) / 1.055, 2.4).toDouble();
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

double _ratio(Color a, Color b) {
  final la = _lum(a);
  final lb = _lum(b);
  return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
}

/// Owner 2026-11-04 (R-368): action icons (like, comment, repost, share,
/// save) are softer than the near-black text, tinted per theme, still
/// clearly visible; the like is red only when liked.
void main() {
  final themes = <String, AppColorTokens>{
    'day': AppColorTokens.light(),
    'night': AppColorTokens.dark(),
    'blue': AppColorTokens.blue(),
    'green': AppColorTokens.green(),
  };

  for (final e in themes.entries) {
    final t = e.value;
    test('${e.key}: action icon reads on card and page (>= 3:1)', () {
      expect(_ratio(t.actionIcon, t.surface), greaterThanOrEqualTo(3));
      expect(_ratio(t.actionIcon, t.bg), greaterThanOrEqualTo(3));
    });

    test('${e.key}: action icon is softer than the text ink', () {
      expect(t.actionIcon, isNot(t.text));
      expect(
        _ratio(t.actionIcon, t.surface),
        lessThan(_ratio(t.text, t.surface)),
      );
    });

    testWidgets('${e.key}: idle like in action ink, liked like red',
        (tester) async {
      Future<Color?> colourOf({required bool active}) async {
        await tester.pumpWidget(
          MaterialApp(
            theme: ThemeData(extensions: [t]),
            home: Scaffold(
              body: BounceIcon(
                active: active,
                icon: AppIcons.favoriteBorderRounded,
                activeIcon: AppIcons.favoriteRounded,
                activeColor: t.danger,
                label: 'like',
                onTap: () {},
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        return tester.widget<Icon>(find.byType(Icon)).color;
      }

      expect(await colourOf(active: false), t.actionIcon);
      expect(await colourOf(active: true), t.danger);
    });
  }
}
