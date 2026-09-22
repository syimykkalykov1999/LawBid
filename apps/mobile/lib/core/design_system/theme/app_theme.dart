import 'package:flutter/material.dart';

import '../tokens/app_fonts.dart';
import '../tokens/app_radii.dart';
import 'app_color_tokens.dart';
import 'app_typography_tokens.dart';

/// Builds the light/dark [ThemeData] for LawBid (file 07 §2-§4).
///
/// Widgets should not read `Theme.of(context).colorScheme` for LawBid-specific
/// colors — that's Material's own palette, kept only so unmodified Material
/// widgets (e.g. `Scaffold`, text-selection handles) still render sanely.
/// Design-system widgets read [AppColorTokens] / [AppTypographyTokens] via
/// `Theme.of(context).extension<...>()!`.
abstract final class AppTheme {
  static ThemeData light() => _build(Brightness.light, AppColorTokens.light());

  static ThemeData dark() => _build(Brightness.dark, AppColorTokens.dark());

  static ThemeData _build(Brightness brightness, AppColorTokens colors) {
    final typography = AppTypographyTokens.standard();

    return ThemeData(
      brightness: brightness,
      useMaterial3: true,
      scaffoldBackgroundColor: colors.bg,
      fontFamily: AppFontFamilies.sans,
      colorScheme: ColorScheme(
        brightness: brightness,
        primary: colors.accent,
        onPrimary: colors.onAccent,
        secondary: colors.gold,
        onSecondary: colors.navy,
        error: colors.danger,
        onError: colors.onAccent,
        surface: colors.surface,
        onSurface: colors.text,
      ),
      extensions: <ThemeExtension<dynamic>>[colors, typography],
      textTheme: TextTheme(
        titleLarge: typography.titleLarge.copyWith(color: colors.text),
        titleMedium: typography.titleMedium.copyWith(color: colors.text),
        bodyLarge: typography.body.copyWith(color: colors.text),
        bodyMedium: typography.body.copyWith(color: colors.text),
        bodySmall: typography.bodySmall.copyWith(color: colors.textSecondary),
        labelLarge: typography.button.copyWith(color: colors.onAccent),
      ),
      dividerColor: colors.border,
      splashFactory: NoSplash.splashFactory,
      highlightColor: Colors.transparent,
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: colors.surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadii.field),
          borderSide: BorderSide(color: colors.border),
        ),
      ),
      visualDensity: VisualDensity.standard,
    );
  }
}
