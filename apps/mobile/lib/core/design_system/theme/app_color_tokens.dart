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
    this.panelBlur = 0,
    this.bgGradient,
    this.bgSpots = const [],
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
      );

  /// Navy: the dark blue theme (owner 2026-10-13).
  factory AppColorTokens.navy() => const AppColorTokens(
        bg: AppColorsNavy.bg,
        surface: AppColorsNavy.surface,
        text: AppColorsNavy.text,
        textSecondary: AppColorsNavy.textSecondary,
        border: AppColorsNavy.border,
        accent: AppColorsNavy.gold,
        onAccent: AppColorsNavy.bg,
        ctaBright: AppColorsNavy.gold,
        onCtaBright: AppColorsNavy.bg,
        gold: AppColorsNavy.gold,
        goldStroke: AppColorsNavy.goldStroke,
        goldLight: AppColorsNavy.goldLight,
        goldDark: AppColorsNavy.goldDark,
        goldAccent: Color(0xFFE0C894),
        navy: AppColorsNavy.navy,
        panFill: AppColorsDark.panFill,
        panText: AppColorsDark.panText,
        watermarkOpacity: AppColorsNavy.watermarkOpacity,
        focusRingGlow: AppColorsDark.focusRingGlow,
        danger: AppColorsStatus.danger,
        success: AppColorsStatus.success,
        warning: AppColorsStatus.warning,
        info: AppColorsStatus.info,
        shadow: AppColorsNavy.shadow,
        goldTint: AppColorsNavy.goldTint,
        dangerTint: AppColorsNavy.dangerTint,
        successTint: AppColorsNavy.successTint,
        infoTint: AppColorsNavy.infoTint,
        skeletonBase: AppColorsNavy.skeletonBase,
        skeletonHighlight: AppColorsNavy.skeletonHighlight,
        onDanger: AppColorsDark.onDanger,
        dangerText: AppColorsNavy.dangerText,
        dangerFill: AppColorsStatus.dangerFill,
        chip: AppColorsNavy.chip,
        sheet: AppColorsNavy.surface,
        inverseText: AppColorsNavy.bg,
        barFill: AppColorsNavy.bg,
        successText: AppColorsStatus.success,
      );

  /// Glass: "wet glass", translucent blurred panels over a gradient.
  factory AppColorTokens.glass() => const AppColorTokens(
        bg: AppColorsGlass.bg,
        surface: AppColorsGlass.surface,
        text: AppColorsGlass.text,
        textSecondary: AppColorsGlass.textSecondary,
        border: AppColorsGlass.border,
        accent: AppColorsGlass.gold,
        onAccent: AppColorsGlass.onCta,
        ctaBright: AppColorsGlass.cta,
        onCtaBright: AppColorsGlass.onCta,
        gold: AppColorsGlass.gold,
        goldStroke: AppColorsGlass.goldStroke,
        goldLight: AppColorsGlass.goldLight,
        goldDark: AppColorsGlass.goldDark,
        goldAccent: Color(0xFFDCBB6E),
        navy: AppColorsGlass.navy,
        panFill: AppColorsDark.panFill,
        panText: AppColorsDark.panText,
        watermarkOpacity: AppColorsGlass.watermarkOpacity,
        focusRingGlow: AppColorsDark.focusRingGlow,
        danger: AppColorsStatus.danger,
        success: AppColorsStatus.success,
        warning: AppColorsStatus.warning,
        info: AppColorsStatus.info,
        shadow: AppColorsGlass.shadow,
        goldTint: AppColorsGlass.goldTint,
        dangerTint: AppColorsGlass.dangerTint,
        successTint: AppColorsGlass.successTint,
        infoTint: AppColorsGlass.infoTint,
        skeletonBase: AppColorsGlass.skeletonBase,
        skeletonHighlight: AppColorsGlass.skeletonHighlight,
        onDanger: AppColorsDark.onDanger,
        dangerText: AppColorsGlass.dangerText,
        dangerFill: AppColorsStatus.dangerFill,
        chip: AppColorsGlass.chip,
        sheet: AppColorsGlass.sheet,
        inverseText: AppColorsGlass.onCta,
        barFill: AppColorsGlass.bar,
        successText: AppColorsGlass.successText,
        panelBlur: AppColorsGlass.blur,
        bgGradient: AppColorsGlass.gradient,
        bgSpots: [
          AppColorsGlass.spotBlue,
          AppColorsGlass.spotIndigo,
          AppColorsGlass.spotTeal,
        ],
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
    if (isGlass) return goldLight;
    return bg.computeLuminance() > 0.5 ? goldDark : gold;
  }

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

  /// Background of a bottom sheet / dialog (an opaque-ish glass for Glass).
  final Color sheet;

  /// Text / icon on a fill made of [text] (snackbar, banners).
  final Color inverseText;

  /// Fill of the top bar / bottom action bar (the page colour; a faint
  /// glass over the gradient in Glass).
  final Color barFill;

  /// Readable green for TEXT on a success tint (lighter on Glass).
  final Color successText;

  /// Blur radius behind a panel; 0 = none (only the Glass theme blurs).
  final double panelBlur;

  /// Gradient painted behind every screen (Glass); null = plain [bg].
  final List<Color>? bgGradient;

  /// Soft light spots drawn over [bgGradient] (top-left, right, bottom-left).
  final List<Color> bgSpots;

  /// True when panels are translucent and blurred (the Glass theme).
  bool get isGlass => panelBlur > 0;

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
    double? panelBlur,
    List<Color>? bgGradient,
    List<Color>? bgSpots,
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
      panelBlur: panelBlur ?? this.panelBlur,
      bgGradient: bgGradient ?? this.bgGradient,
      bgSpots: bgSpots ?? this.bgSpots,
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
      skeletonHighlight:
          Color.lerp(skeletonHighlight, other.skeletonHighlight, t)!,
      onDanger: Color.lerp(onDanger, other.onDanger, t)!,
      dangerText: Color.lerp(dangerText, other.dangerText, t)!,
      dangerFill: Color.lerp(dangerFill, other.dangerFill, t)!,
      chip: Color.lerp(chip, other.chip, t)!,
      sheet: Color.lerp(sheet, other.sheet, t)!,
      inverseText: Color.lerp(inverseText, other.inverseText, t)!,
      barFill: Color.lerp(barFill, other.barFill, t)!,
      successText: Color.lerp(successText, other.successText, t)!,
      panelBlur: panelBlur + (other.panelBlur - panelBlur) * t,
      bgGradient: t < 0.5 ? bgGradient : other.bgGradient,
      bgSpots: t < 0.5 ? bgSpots : other.bgSpots,
    );
  }
}
