import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/theme/app_typography_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_fonts.dart';
import 'package:lawbid/core/design_system/tokens/app_radii.dart';

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
      // Owner 2026-10-01: every pushed screen (also plain MaterialPageRoute)
      // goes back with a swipe from the left edge, on iPhone and Android.
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: CupertinoPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
        },
      ),
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
      // UI modernization pass (2026-09-27): dialogs, sheets and snackbars
      // share the card corner language and brand surfaces instead of
      // Material defaults. The welcome screen uses none of them (its
      // "not built yet" SnackBar is left on Material defaults on purpose —
      // non-welcome screens use `showAppSnackBar` instead).
      dialogTheme: DialogThemeData(
        backgroundColor: colors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.sheet),
          side: BorderSide(color: colors.border),
        ),
        titleTextStyle: typography.roleTitle.copyWith(color: colors.text),
        contentTextStyle: typography.body.copyWith(color: colors.textSecondary),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: colors.surface,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(AppRadii.sheet),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: colors.text,
          textStyle: typography.button,
          minimumSize: const Size(44, 44),
        ),
      ),
    );
  }
}
