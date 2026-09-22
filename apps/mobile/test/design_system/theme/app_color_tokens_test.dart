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

    test('lerp returns unchanged tokens when other is not AppColorTokens', () {
      final light = AppColorTokens.light();
      // ThemeExtension.lerp contract: unrelated extension types pass through.
      expect(light.lerp(null, 0.5), light);
    });
  });
}
