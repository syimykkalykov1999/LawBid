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
    required this.navy,
    required this.panFill,
    required this.panText,
    required this.watermarkOpacity,
    required this.focusRingGlow,
    required this.danger,
    required this.success,
    required this.warning,
    required this.shadow,
    required this.goldTint,
    required this.dangerTint,
    required this.successTint,
    required this.skeletonBase,
    required this.skeletonHighlight,
    required this.onDanger,
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
        navy: AppColorsLight.navy,
        panFill: AppColorsLight.panFill,
        panText: AppColorsLight.panText,
        watermarkOpacity: AppColorsLight.watermarkOpacity,
        focusRingGlow: AppColorsLight.focusRingGlow,
        danger: AppColorsStatus.danger,
        success: AppColorsStatus.success,
        warning: AppColorsStatus.warning,
        shadow: AppColorsLight.shadow,
        goldTint: AppColorsLight.goldTint,
        dangerTint: AppColorsLight.dangerTint,
        successTint: AppColorsLight.successTint,
        skeletonBase: AppColorsLight.skeletonBase,
        skeletonHighlight: AppColorsLight.skeletonHighlight,
        onDanger: AppColorsLight.onDanger,
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
        navy: AppColorsDark.navy,
        panFill: AppColorsDark.panFill,
        panText: AppColorsDark.panText,
        watermarkOpacity: AppColorsDark.watermarkOpacity,
        focusRingGlow: AppColorsDark.focusRingGlow,
        danger: AppColorsStatus.danger,
        success: AppColorsStatus.success,
        warning: AppColorsStatus.warning,
        shadow: AppColorsDark.shadow,
        goldTint: AppColorsDark.goldTint,
        dangerTint: AppColorsDark.dangerTint,
        successTint: AppColorsDark.successTint,
        skeletonBase: AppColorsDark.skeletonBase,
        skeletonHighlight: AppColorsDark.skeletonHighlight,
        onDanger: AppColorsDark.onDanger,
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
  final Color navy;
  final Color panFill;
  final Color panText;
  final double watermarkOpacity;
  final Color focusRingGlow;
  final Color danger;
  final Color success;
  final Color warning;

  // UI modernization pass (2026-09-27) — see AppColorsLight for meaning.
  final Color shadow;
  final Color goldTint;
  final Color dangerTint;
  final Color successTint;
  final Color skeletonBase;
  final Color skeletonHighlight;
  final Color onDanger;

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
    Color? navy,
    Color? panFill,
    Color? panText,
    double? watermarkOpacity,
    Color? focusRingGlow,
    Color? danger,
    Color? success,
    Color? warning,
    Color? shadow,
    Color? goldTint,
    Color? dangerTint,
    Color? successTint,
    Color? skeletonBase,
    Color? skeletonHighlight,
    Color? onDanger,
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
      navy: navy ?? this.navy,
      panFill: panFill ?? this.panFill,
      panText: panText ?? this.panText,
      watermarkOpacity: watermarkOpacity ?? this.watermarkOpacity,
      focusRingGlow: focusRingGlow ?? this.focusRingGlow,
      danger: danger ?? this.danger,
      success: success ?? this.success,
      warning: warning ?? this.warning,
      shadow: shadow ?? this.shadow,
      goldTint: goldTint ?? this.goldTint,
      dangerTint: dangerTint ?? this.dangerTint,
      successTint: successTint ?? this.successTint,
      skeletonBase: skeletonBase ?? this.skeletonBase,
      skeletonHighlight: skeletonHighlight ?? this.skeletonHighlight,
      onDanger: onDanger ?? this.onDanger,
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
      navy: Color.lerp(navy, other.navy, t)!,
      panFill: Color.lerp(panFill, other.panFill, t)!,
      panText: Color.lerp(panText, other.panText, t)!,
      watermarkOpacity:
          watermarkOpacity + (other.watermarkOpacity - watermarkOpacity) * t,
      focusRingGlow: Color.lerp(focusRingGlow, other.focusRingGlow, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      shadow: Color.lerp(shadow, other.shadow, t)!,
      goldTint: Color.lerp(goldTint, other.goldTint, t)!,
      dangerTint: Color.lerp(dangerTint, other.dangerTint, t)!,
      successTint: Color.lerp(successTint, other.successTint, t)!,
      skeletonBase: Color.lerp(skeletonBase, other.skeletonBase, t)!,
      skeletonHighlight:
          Color.lerp(skeletonHighlight, other.skeletonHighlight, t)!,
      onDanger: Color.lerp(onDanger, other.onDanger, t)!,
    );
  }
}
