import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';

// WCAG 2.x: 1.4.3 text >= 4.5:1, 1.4.11 icons / UI >= 3:1.
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

Color _over(Color fg, Color bg) => Color.alphaBlend(fg, bg);

void main() {
  const white = Color(0xFFFFFFFF);

  // Every preset of the registry: adding a theme adds its checks.
  for (final spec in AppThemes.all) {
    final t = spec.tokens();
    final chat = ChatColors.forTokens(t, spec.brightness);
    final name = spec.wire;

    void text(String label, Color fg, Color bg) => expect(
          _ratio(fg, bg),
          greaterThanOrEqualTo(4.5),
          reason: '$name: $label ${_ratio(fg, bg).toStringAsFixed(2)} < 4.5',
        );
    void icon(String label, Color fg, Color bg) => expect(
          _ratio(fg, bg),
          greaterThanOrEqualTo(3),
          reason: '$name: $label ${_ratio(fg, bg).toStringAsFixed(2)} < 3',
        );

    test('$name: text on page, card and chip (>= 4.5:1)', () {
      for (final bg in [t.bg, t.surface]) {
        text('text', t.text, bg);
        text('textSecondary', t.textSecondary, bg);
        text('goldText', t.goldText, bg);
        text('dangerText', t.dangerText, bg);
        text('successText', t.successText, bg);
      }
      text('textSecondary on chip', t.textSecondary, t.chip);
      text('onAccent on accent', t.onAccent, t.accent);
      text('onCtaBright on ctaBright', t.onCtaBright, t.ctaBright);
      text('onDanger on dangerFill', t.onDanger, t.dangerFill);
    });

    test('$name: icons and accents on page and card (>= 3:1)', () {
      for (final bg in [t.bg, t.surface]) {
        icon('iconTint', t.iconTint, bg);
        icon('accent', t.accent, bg);
        icon('goldAccent', t.goldAccent, bg);
        icon('verifiedGold', t.verifiedGold, bg);
        icon('danger', t.danger, bg);
        icon('success', t.success, bg);
        icon('warning', t.warning, bg);
        icon('info', t.info, bg);
      }
    });

    test('$name: verified badge, white check on green (>= 3:1)', () {
      icon('verifiedGreen vs white check', t.verifiedGreen, white);
    });

    test('$name: chat bubbles', () {
      text('onMine', chat.onMine, chat.mine);
      text('onTheirs', chat.onTheirs, chat.theirs);
      text('mineMeta', _over(chat.mineMeta, chat.mine), chat.mine);
      text('theirsMeta', chat.theirsMeta, chat.theirs);
      icon('tickRead', chat.tickRead, chat.mine);
    });
  }

  test('semantic colours stay semantic in every theme', () {
    for (final spec in AppThemes.all) {
      final t = spec.tokens();
      // Verified badge is the same green; danger is red-ish, success green-ish.
      expect(t.verifiedGreen, const Color(0xFF1F9D67), reason: spec.wire);
      final danger = HSVColor.fromColor(t.danger);
      final success = HSVColor.fromColor(t.success);
      final redHue = danger.hue < 20 || danger.hue > 340;
      expect(redHue, isTrue, reason: '${spec.wire}: danger hue ${danger.hue}');
      expect(
        success.hue,
        inInclusiveRange(100, 170),
        reason: '${spec.wire}: success hue ${success.hue}',
      );
    }
  });

  group('media overlay tokens (independent of the theme)', () {
    const black = Color(0xFF000000);
    // Worst realistic frame under the rail: mid-grey video at the scrim.
    final worstFrame = _over(AppMediaOverlay.scrim, const Color(0xFFBDBDBD));

    test('ink is pure white and reads on the scrim', () {
      expect(AppMediaOverlay.ink, white);
      expect(_ratio(AppMediaOverlay.ink, black), greaterThanOrEqualTo(21));
      expect(_ratio(AppMediaOverlay.ink, worstFrame), greaterThanOrEqualTo(3));
    });

    test('active states are vivid and read on dark media', () {
      final onDark = _over(AppMediaOverlay.scrim, const Color(0xFF202020));
      expect(AppMediaOverlay.liked, AppColorsStatus.danger);
      for (final c in [
        AppMediaOverlay.liked,
        AppMediaOverlay.reposted,
        AppMediaOverlay.saved,
        AppMediaOverlay.verified,
        AppMediaOverlay.error,
      ]) {
        expect(_ratio(c, onDark), greaterThanOrEqualTo(3), reason: '$c');
        // Vivid: saturated, not a pastel.
        expect(HSVColor.fromColor(c).saturation, greaterThan(0.6));
      }
    });

    test('pill and round control keep the white glyph readable', () {
      const frame = Color(0xFFFFFFFF);
      for (final fill in [
        AppMediaOverlay.pillFill,
        AppMediaOverlay.controlFill,
      ]) {
        expect(
          _ratio(AppMediaOverlay.ink, _over(fill, frame)),
          greaterThanOrEqualTo(3),
        );
      }
    });
  });
}
