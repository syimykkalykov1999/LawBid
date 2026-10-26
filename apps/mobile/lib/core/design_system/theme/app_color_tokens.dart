import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/tokens/app_colors.dart';

/// Design-system color tokens (file 07 §2). Access via
/// `Theme.of(context).extension<AppColorTokens>()!`.
@immutable
final class AppColorTokens extends ThemeExtension<AppColorTokens> {
  const AppColorTokens({
    required this.bg,
    required this.surface,
    required this.text,
    required this.textSecondary,
    required this.border,
    required this.accent,
    required this.onAccent,
    required this.ctaBright,
    required this.onCtaBright,
    required this.gold,
    required this.goldStroke,
    required this.goldLight,
    required this.goldDark,
    required this.goldAccent,
    required this.navy,
    required this.panFill,
    required this.panText,
    required this.watermarkOpacity,
    required this.focusRingGlow,
    required this.danger,
    required this.success,
    required this.warning,
    required this.info,
    required this.shadow,
    required this.goldTint,
    required this.dangerTint,
    required this.successTint,
    required this.infoTint,
    required this.skeletonBase,
    required this.skeletonHighlight,
    required this.onDanger,
    required this.dangerText,
    required this.dangerFill,
    required this.chip,
    required this.sheet,
    required this.inverseText,
    required this.barFill,
    required this.successText,
    required this.verifiedGold,
    required this.verifiedGreen,
    this.headerFill,
    this.headerGradient,
    this.onHeader,
  });

  factory AppColorTokens.light() => const AppColorTokens(
        bg: AppColorsLight.bg,
        surface: AppColorsLight.surface,
        text: AppColorsLight.text,
        textSecondary: AppColorsLight.textSecondary,
        border: AppColorsLight.border,
        accent: AppColorsLight.accent,
        onAccent: AppColorsLight.onAccent,
        ctaBright: AppColorsLight.ctaBright,
        onCtaBright: AppColorsLight.onCtaBright,
        gold: AppColorsLight.gold,
        goldStroke: AppColorsLight.goldStroke,
        goldLight: AppColorsLight.goldLight,
        goldDark: AppColorsLight.goldDark,
        goldAccent: Color(0xFF9C7A35),
        navy: AppColorsLight.navy,
        panFill: AppColorsLight.panFill,
        panText: AppColorsLight.panText,
        watermarkOpacity: AppColorsLight.watermarkOpacity,
        focusRingGlow: AppColorsLight.focusRingGlow,
        danger: AppColorsStatus.danger,
        success: AppColorsStatus.success,
        warning: AppColorsStatus.warning,
        info: AppColorsStatus.info,
        shadow: AppColorsLight.shadow,
        goldTint: AppColorsLight.goldTint,
        dangerTint: AppColorsLight.dangerTint,
        successTint: AppColorsLight.successTint,
        infoTint: AppColorsLight.infoTint,
        skeletonBase: AppColorsLight.skeletonBase,
        skeletonHighlight: AppColorsLight.skeletonHighlight,
        onDanger: AppColorsLight.onDanger,
        dangerText: AppColorsLight.dangerText,
        dangerFill: AppColorsStatus.dangerFill,
        chip: AppColorsLight.skeletonBase,
        sheet: AppColorsLight.surface,
        inverseText: AppColorsLight.bg,
        barFill: AppColorsLight.bg,
        successText: AppColorsStatus.success,
        verifiedGold: Color(0xFF9C7A35),
        verifiedGreen: Color(0xFF1F9D67),
      );

  factory AppColorTokens.dark() => const AppColorTokens(
        bg: AppColorsDark.bg,
        surface: AppColorsDark.surface,
        text: AppColorsDark.text,
        textSecondary: AppColorsDark.textSecondary,
        border: AppColorsDark.border,
        accent: AppColorsDark.accent,
        onAccent: AppColorsDark.onAccent,
        ctaBright: AppColorsDark.ctaBright,
        onCtaBright: AppColorsDark.onCtaBright,
        gold: AppColorsDark.gold,
        goldStroke: AppColorsDark.goldStroke,
        goldLight: AppColorsDark.goldLight,
        goldDark: AppColorsDark.goldDark,
        goldAccent: Color(0xFFE6CE98),
        navy: AppColorsDark.navy,
        panFill: AppColorsDark.panFill,
        panText: AppColorsDark.panText,
        watermarkOpacity: AppColorsDark.watermarkOpacity,
        focusRingGlow: AppColorsDark.focusRingGlow,
        danger: AppColorsStatus.danger,
        success: AppColorsStatus.success,
        warning: AppColorsStatus.warning,
        info: AppColorsStatus.info,
        shadow: AppColorsDark.shadow,
        goldTint: AppColorsDark.goldTint,
        dangerTint: AppColorsDark.dangerTint,
        successTint: AppColorsDark.successTint,
        infoTint: AppColorsDark.infoTint,
        skeletonBase: AppColorsDark.skeletonBase,
        skeletonHighlight: AppColorsDark.skeletonHighlight,
        onDanger: AppColorsDark.onDanger,
        dangerText: AppColorsDark.dangerText,
        dangerFill: AppColorsStatus.dangerFill,
        chip: AppColorsDark.skeletonBase,
        sheet: AppColorsDark.surface,
        inverseText: AppColorsDark.bg,
        barFill: AppColorsDark.bg,
        successText: AppColorsStatus.success,
        verifiedGold: Color(0xFFE6CE98),
        verifiedGreen: Color(0xFF1F9D67),
      );

  /// Blue: the Citi app look (owner 2026-10-23), built like Night: a solid
  /// deep-blue page, white ink, lighter-blue cards, a white button.
  factory AppColorTokens.blue() => const AppColorTokens(
        bg: AppColorsBlue.bg,
        surface: AppColorsBlue.surface,
        text: AppColorsBlue.text,
        textSecondary: AppColorsBlue.textSecondary,
        border: AppColorsBlue.border,
        accent: AppColorsBlue.accent,
        onAccent: AppColorsBlue.onAccent,
        ctaBright: AppColorsBlue.accent,
        onCtaBright: AppColorsBlue.onAccent,
        gold: AppColorsBlue.gold,
        goldStroke: AppColorsBlue.goldStroke,
        goldLight: AppColorsBlue.goldLight,
        goldDark: AppColorsBlue.goldDark,
        goldAccent: AppColorsBlue.goldLight,
        navy: AppColorsBlue.navy,
        panFill: AppColorsBlue.accent,
        panText: AppColorsBlue.onAccent,
        watermarkOpacity: AppColorsBlue.watermarkOpacity,
        focusRingGlow: AppColorsDark.focusRingGlow,
        danger: AppColorsBlue.danger,
        success: AppColorsBlue.success,
        warning: AppColorsBlue.warning,
        info: AppColorsBlue.info,
        shadow: AppColorsBlue.shadow,
        goldTint: AppColorsBlue.goldTint,
        dangerTint: AppColorsBlue.dangerTint,
        successTint: AppColorsBlue.successTint,
        infoTint: AppColorsBlue.infoTint,
        skeletonBase: AppColorsBlue.skeletonBase,
        skeletonHighlight: AppColorsBlue.skeletonHighlight,
        onDanger: AppColorsDark.onDanger,
        dangerText: AppColorsBlue.dangerText,
        dangerFill: AppColorsStatus.dangerFill,
        chip: AppColorsBlue.chip,
        sheet: AppColorsBlue.surface,
        inverseText: AppColorsBlue.bg,
        barFill: AppColorsBlue.bar,
        successText: AppColorsBlue.success,
        verifiedGold: Color(0xFFFFC629),
        verifiedGreen: Color(0xFF1F9D67),
      );

  /// Green: the Credit Karma look (owner 2026-10-23), built like Night: a
  /// solid green page, white ink, darker-green cards, a white button.
  factory AppColorTokens.green() => const AppColorTokens(
        bg: AppColorsGreen.bg,
        surface: AppColorsGreen.surface,
        text: AppColorsGreen.text,
        textSecondary: AppColorsGreen.textSecondary,
        border: AppColorsGreen.border,
        accent: AppColorsGreen.accent,
        onAccent: AppColorsGreen.onAccent,
        ctaBright: AppColorsGreen.accent,
        onCtaBright: AppColorsGreen.onAccent,
        gold: AppColorsGreen.gold,
        goldStroke: AppColorsGreen.goldStroke,
        goldLight: AppColorsGreen.goldLight,
        goldDark: AppColorsGreen.goldDark,
        goldAccent: AppColorsGreen.goldLight,
        navy: AppColorsGreen.navy,
        panFill: AppColorsGreen.accent,
        panText: AppColorsGreen.onAccent,
        watermarkOpacity: AppColorsGreen.watermarkOpacity,
        focusRingGlow: AppColorsDark.focusRingGlow,
        danger: AppColorsGreen.danger,
        success: AppColorsGreen.success,
        warning: AppColorsGreen.warning,
        info: AppColorsGreen.info,
        shadow: AppColorsGreen.shadow,
        goldTint: AppColorsGreen.goldTint,
        dangerTint: AppColorsGreen.dangerTint,
        successTint: AppColorsGreen.successTint,
        infoTint: AppColorsGreen.infoTint,
        skeletonBase: AppColorsGreen.skeletonBase,
        skeletonHighlight: AppColorsGreen.skeletonHighlight,
        onDanger: AppColorsDark.onDanger,
        dangerText: AppColorsGreen.dangerText,
        dangerFill: AppColorsStatus.dangerFill,
        chip: AppColorsGreen.chip,
        sheet: AppColorsGreen.surface,
        inverseText: AppColorsGreen.bg,
        barFill: AppColorsGreen.bar,
        successText: AppColorsGreen.success,
        verifiedGold: Color(0xFFFFC629),
        verifiedGreen: Color(0xFF1F9D67),
      );

  final Color bg;
  final Color surface;
  final Color text;
  final Color textSecondary;
  final Color border;
  final Color accent;
  final Color onAccent;
  final Color ctaBright;
  final Color onCtaBright;
  final Color gold;
  final Color goldStroke;
  final Color goldLight;
  final Color goldDark;

  /// The gold of selected icons and the gold check: a shade per theme so
  /// it stays visible on that theme's bars (contrast ≥ 3:1).
  final Color goldAccent;

  /// Owner 2026-10-20: gold for SMALL TEXT (links, captions): the deep gold
  /// on the light theme (the plain gold is 2.3:1 on white), the plain gold on
  /// the dark ones. Big icons and buttons keep [gold].
  Color get goldText {
    return bg.computeLuminance() > 0.5 ? goldDark : gold;
  }

  /// Owner 2026-10-20: the colour of tinted icons (tile icons, selected tab,
  /// picked rows): the theme's own ink, the deep navy on the light theme.
  /// Never gold: gold stays for the client check and rating stars only.
  Color get iconTint => bg.computeLuminance() > 0.5 ? accent : text;

  /// Soft fill behind a tinted icon (icon circles, tiles): [iconTint] at a
  /// low alpha, so it follows the theme instead of the gold wash.
  Color get iconTintFill => iconTint.withValues(alpha: 0.12);

  final Color navy;
  final Color panFill;
  final Color panText;
  final double watermarkOpacity;
  final Color focusRingGlow;
  final Color danger;
  final Color success;
  final Color warning;

  /// Informational status (docs/01 §8.1 `info`).
  final Color info;

  // UI modernization pass (2026-09-27) — see AppColorsLight for meaning.
  final Color shadow;
  final Color goldTint;
  final Color dangerTint;
  final Color successTint;
  final Color infoTint;
  final Color skeletonBase;
  final Color skeletonHighlight;
  final Color onDanger;

  /// AA-readable danger for text (see AppColorsLight.dangerText).
  final Color dangerText;

  /// AA fill behind [onDanger] text (see AppColorsStatus.dangerFill).
  final Color dangerFill;

  /// Small chip / tag fill (tags, counters, segmented backgrounds).
  final Color chip;

  /// Background of a bottom sheet / dialog.
  final Color sheet;

  /// Text / icon on a fill made of [text] (snackbar, banners).
  final Color inverseText;

  /// Fill of the top bar / bottom action bar (the page colour).
  final Color barFill;

  /// Readable green for TEXT on a success tint .
  final Color successText;

  /// Verified (client) check: saturated gold, >= 3:1 on the page and card
  /// of every theme (WCAG 1.4.11). Owner 2026-10-26.
  final Color verifiedGold;

  /// Attorney verified badge green: >= 3:1 against the white icon on it
  /// (WCAG 1.4.11), in every theme.
  final Color verifiedGreen;

  /// Owner 2026-10-22 (Blue, Green): the top bar is a deep-to-light wash
  /// with white ink, over a light page. null = the plain [barFill] bar with
  /// [text] ink (Day, Night).
  final Color? headerFill;
  final List<Color>? headerGradient;
  final Color? onHeader;

  /// True when the top bar is a coloured wash with its own ink.
  bool get hasHeaderWash => headerGradient != null;

  /// Fill of the top bar.
  Color get headerBg => headerFill ?? barFill;

  /// Ink of the title and icons on the top bar.
  Color get headerInk => onHeader ?? text;

  @override
  AppColorTokens copyWith({
    Color? bg,
    Color? surface,
    Color? text,
    Color? textSecondary,
    Color? border,
    Color? accent,
    Color? onAccent,
    Color? ctaBright,
    Color? onCtaBright,
    Color? gold,
    Color? goldStroke,
    Color? goldLight,
    Color? goldDark,
    Color? goldAccent,
    Color? navy,
    Color? panFill,
    Color? panText,
    double? watermarkOpacity,
    Color? focusRingGlow,
    Color? danger,
    Color? success,
    Color? warning,
    Color? info,
    Color? shadow,
    Color? goldTint,
    Color? dangerTint,
    Color? successTint,
    Color? infoTint,
    Color? skeletonBase,
    Color? skeletonHighlight,
    Color? onDanger,
    Color? dangerText,
    Color? dangerFill,
    Color? chip,
    Color? sheet,
    Color? inverseText,
    Color? barFill,
    Color? successText,
    Color? verifiedGold,
    Color? verifiedGreen,
    Color? headerFill,
    List<Color>? headerGradient,
    Color? onHeader,
  }) {
    return AppColorTokens(
      bg: bg ?? this.bg,
      surface: surface ?? this.surface,
      text: text ?? this.text,
      textSecondary: textSecondary ?? this.textSecondary,
      border: border ?? this.border,
      accent: accent ?? this.accent,
      onAccent: onAccent ?? this.onAccent,
      ctaBright: ctaBright ?? this.ctaBright,
      onCtaBright: onCtaBright ?? this.onCtaBright,
      gold: gold ?? this.gold,
      goldStroke: goldStroke ?? this.goldStroke,
      goldLight: goldLight ?? this.goldLight,
      goldDark: goldDark ?? this.goldDark,
      goldAccent: goldAccent ?? this.goldAccent,
      navy: navy ?? this.navy,
      panFill: panFill ?? this.panFill,
      panText: panText ?? this.panText,
      watermarkOpacity: watermarkOpacity ?? this.watermarkOpacity,
      focusRingGlow: focusRingGlow ?? this.focusRingGlow,
      danger: danger ?? this.danger,
      success: success ?? this.success,
      warning: warning ?? this.warning,
      info: info ?? this.info,
      shadow: shadow ?? this.shadow,
      goldTint: goldTint ?? this.goldTint,
      dangerTint: dangerTint ?? this.dangerTint,
      successTint: successTint ?? this.successTint,
      infoTint: infoTint ?? this.infoTint,
      skeletonBase: skeletonBase ?? this.skeletonBase,
      skeletonHighlight: skeletonHighlight ?? this.skeletonHighlight,
      onDanger: onDanger ?? this.onDanger,
      dangerText: dangerText ?? this.dangerText,
      dangerFill: dangerFill ?? this.dangerFill,
      chip: chip ?? this.chip,
      sheet: sheet ?? this.sheet,
      inverseText: inverseText ?? this.inverseText,
      barFill: barFill ?? this.barFill,
      successText: successText ?? this.successText,
      verifiedGold: verifiedGold ?? this.verifiedGold,
      verifiedGreen: verifiedGreen ?? this.verifiedGreen,
      headerFill: headerFill ?? this.headerFill,
      headerGradient: headerGradient ?? this.headerGradient,
      onHeader: onHeader ?? this.onHeader,
    );
  }

  @override
  AppColorTokens lerp(covariant AppColorTokens? other, double t) {
    if (other is! AppColorTokens) return this;
    return AppColorTokens(
      bg: Color.lerp(bg, other.bg, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      text: Color.lerp(text, other.text, t)!,
      textSecondary: Color.lerp(textSecondary, other.textSecondary, t)!,
      border: Color.lerp(border, other.border, t)!,
      accent: Color.lerp(accent, other.accent, t)!,
      onAccent: Color.lerp(onAccent, other.onAccent, t)!,
      ctaBright: Color.lerp(ctaBright, other.ctaBright, t)!,
      onCtaBright: Color.lerp(onCtaBright, other.onCtaBright, t)!,
      gold: Color.lerp(gold, other.gold, t)!,
      goldStroke: Color.lerp(goldStroke, other.goldStroke, t)!,
      goldLight: Color.lerp(goldLight, other.goldLight, t)!,
      goldDark: Color.lerp(goldDark, other.goldDark, t)!,
      goldAccent: Color.lerp(goldAccent, other.goldAccent, t)!,
      navy: Color.lerp(navy, other.navy, t)!,
      panFill: Color.lerp(panFill, other.panFill, t)!,
      panText: Color.lerp(panText, other.panText, t)!,
      watermarkOpacity:
          watermarkOpacity + (other.watermarkOpacity - watermarkOpacity) * t,
      focusRingGlow: Color.lerp(focusRingGlow, other.focusRingGlow, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      info: Color.lerp(info, other.info, t)!,
      shadow: Color.lerp(shadow, other.shadow, t)!,
      goldTint: Color.lerp(goldTint, other.goldTint, t)!,
      dangerTint: Color.lerp(dangerTint, other.dangerTint, t)!,
      successTint: Color.lerp(successTint, other.successTint, t)!,
      infoTint: Color.lerp(infoTint, other.infoTint, t)!,
      skeletonBase: Color.lerp(skeletonBase, other.skeletonBase, t)!,
      skeletonHighlight: Color.lerp(
        skeletonHighlight,
        other.skeletonHighlight,
        t,
      )!,
      onDanger: Color.lerp(onDanger, other.onDanger, t)!,
      dangerText: Color.lerp(dangerText, other.dangerText, t)!,
      dangerFill: Color.lerp(dangerFill, other.dangerFill, t)!,
      chip: Color.lerp(chip, other.chip, t)!,
      sheet: Color.lerp(sheet, other.sheet, t)!,
      inverseText: Color.lerp(inverseText, other.inverseText, t)!,
      barFill: Color.lerp(barFill, other.barFill, t)!,
      successText: Color.lerp(successText, other.successText, t)!,
      verifiedGold: Color.lerp(verifiedGold, other.verifiedGold, t)!,
      verifiedGreen: Color.lerp(verifiedGreen, other.verifiedGreen, t)!,
      headerFill: Color.lerp(headerFill, other.headerFill, t),
      headerGradient: t < 0.5 ? headerGradient : other.headerGradient,
      onHeader: Color.lerp(onHeader, other.onHeader, t),
    );
  }
}
