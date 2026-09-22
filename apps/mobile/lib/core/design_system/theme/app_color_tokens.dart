import 'package:flutter/material.dart';

import '../tokens/app_colors.dart';

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
  });

  factory AppColorTokens.light() => const AppColorTokens(
        bg: AppColorsLight.bg,
        surface: AppColorsLight.surface,
        text: AppColorsLight.text,
        textSecondary: AppColorsLight.textSecondary,
        border: AppColorsLight.border,
        accent: AppColorsLight.accent,
        onAccent: AppColorsLight.onAccent,
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
      );

  factory AppColorTokens.dark() => const AppColorTokens(
        bg: AppColorsDark.bg,
        surface: AppColorsDark.surface,
        text: AppColorsDark.text,
        textSecondary: AppColorsDark.textSecondary,
        border: AppColorsDark.border,
        accent: AppColorsDark.accent,
        onAccent: AppColorsDark.onAccent,
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
      );

  final Color bg;
  final Color surface;
  final Color text;
  final Color textSecondary;
  final Color border;
  final Color accent;
  final Color onAccent;
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

  @override
  AppColorTokens copyWith({
    Color? bg,
    Color? surface,
    Color? text,
    Color? textSecondary,
    Color? border,
    Color? accent,
    Color? onAccent,
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
  }) {
    return AppColorTokens(
      bg: bg ?? this.bg,
      surface: surface ?? this.surface,
      text: text ?? this.text,
      textSecondary: textSecondary ?? this.textSecondary,
      border: border ?? this.border,
      accent: accent ?? this.accent,
      onAccent: onAccent ?? this.onAccent,
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
    );
  }
}
