import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';

void main() {
  group('AppColorTokens', () {
    test('light() and dark() produce distinct palettes', () {
      final light = AppColorTokens.light();
      final dark = AppColorTokens.dark();
      expect(light.bg, isNot(equals(dark.bg)));
      expect(light.accent, isNot(equals(dark.accent)));
    });

    test('copyWith overrides only the given fields', () {
      final light = AppColorTokens.light();
      final overridden = light.copyWith(accent: Colors.red);
      expect(overridden.accent, Colors.red);
      expect(overridden.bg, light.bg);
    });

    test('lerp at t=0 returns this, at t=1 returns other', () {
      final light = AppColorTokens.light();
      final dark = AppColorTokens.dark();
      final atStart = light.lerp(dark, 0);
      final atEnd = light.lerp(dark, 1);
      expect(atStart.bg, light.bg);
      expect(atEnd.bg, dark.bg);
    });

    test('status colors match docs/01 §8.1 in both themes', () {
      for (final tokens in [AppColorTokens.light(), AppColorTokens.dark()]) {
        expect(tokens.danger, const Color(0xFFD64545));
        expect(tokens.success, const Color(0xFF1F9D67));
        expect(tokens.warning, const Color(0xFFD98A00));
        expect(tokens.info, const Color(0xFF2F80ED));
      }
    });

    test('status tints derive from the spec status hues', () {
      for (final tokens in [AppColorTokens.light(), AppColorTokens.dark()]) {
        expect(tokens.successTint.withValues(alpha: 1), tokens.success);
        expect(tokens.infoTint.withValues(alpha: 1), tokens.info);
        expect(tokens.successTint.a, lessThan(0.2));
        expect(tokens.infoTint.a, lessThan(0.2));
      }
    });

    double contrast(Color a, Color b) {
      final la = a.computeLuminance();
      final lb = b.computeLuminance();
      return ((la > lb ? la : lb) + 0.05) / ((la > lb ? lb : la) + 0.05);
    }

    test('danger text/fill tokens meet WCAG AA 4.5:1 (docs/01 §8.4)', () {
      for (final tokens in [AppColorTokens.light(), AppColorTokens.dark()]) {
        expect(contrast(tokens.dangerText, tokens.bg), greaterThan(4.5));
        expect(contrast(tokens.dangerText, tokens.surface), greaterThan(4.5));
        expect(contrast(tokens.onDanger, tokens.dangerFill), greaterThan(4.5));
      }
    });

    test('status colors clear 3:1 non-text contrast on the dark bg', () {
      final dark = AppColorTokens.dark();
      for (final c in [dark.danger, dark.success, dark.warning, dark.info]) {
        expect(contrast(c, dark.bg), greaterThan(3));
      }
    });

    test('lerp carries the new tokens', () {
      final mid = AppColorTokens.light().lerp(AppColorTokens.dark(), 1);
      expect(mid.info, AppColorTokens.dark().info);
      expect(mid.dangerText, AppColorTokens.dark().dangerText);
    });

    test('lerp returns unchanged tokens when other is not AppColorTokens', () {
      final light = AppColorTokens.light();
      // ThemeExtension.lerp contract: unrelated extension types pass through.
      expect(light.lerp(null, 0.5), light);
    });
  });
}
