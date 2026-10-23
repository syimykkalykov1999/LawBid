import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/theme/app_theme_id.dart';
import 'package:lawbid/core/design_system/theme/app_typography_tokens.dart';
import 'package:lawbid/core/design_system/theme/chat_colors.dart';
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
  /// [reduceMotion] (owner 2026-10-22, checklist §17): the phone asks for
  /// less motion — routes swap without a transition
  /// (core/accessibility/reduce_motion.dart).
  static ThemeData light({bool reduceMotion = false}) =>
      _build(Brightness.light, AppColorTokens.light(), reduceMotion);

  static ThemeData dark({bool reduceMotion = false}) =>
      _build(Brightness.dark, AppColorTokens.dark(), reduceMotion);

  /// The theme the user picked (owner 2026-10-13: Day, Night, Navy, Glass).
  static ThemeData of(AppThemeId id, {bool reduceMotion = false}) =>
      (reduceMotion ? _cacheStill : _cache).putIfAbsent(id, () {
        final spec = AppThemes.of(id);
        return _build(spec.brightness, spec.tokens(), reduceMotion);
      });

  static final Map<AppThemeId, ThemeData> _cache = {};
  static final Map<AppThemeId, ThemeData> _cacheStill = {};

  /// No-motion route transitions for every platform (reduce motion).
  static const PageTransitionsTheme stillTransitions = PageTransitionsTheme(
    builders: {
      TargetPlatform.android: _NoMotionTransitionsBuilder(),
      TargetPlatform.iOS: _NoMotionTransitionsBuilder(),
      TargetPlatform.macOS: _NoMotionTransitionsBuilder(),
      TargetPlatform.linux: _NoMotionTransitionsBuilder(),
      TargetPlatform.windows: _NoMotionTransitionsBuilder(),
      TargetPlatform.fuchsia: _NoMotionTransitionsBuilder(),
    },
  );

  static ThemeData _build(
    Brightness brightness,
    AppColorTokens colors, [
    bool reduceMotion = false,
  ]) {
    final typography = AppTypographyTokens.standard();

    return ThemeData(
      // Owner 2026-10-01: every pushed screen (also plain MaterialPageRoute)
      // goes back with a swipe from the left edge, on iPhone and Android.
      pageTransitionsTheme: reduceMotion
          ? stillTransitions
          : const PageTransitionsTheme(
              builders: {
                TargetPlatform.android: CupertinoPageTransitionsBuilder(),
                TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
                TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
              },
            ),
      brightness: brightness,
      useMaterial3: true,
      // Glass paints its gradient behind the whole app (AppBackdrop), so
      // screens are transparent over it.
      scaffoldBackgroundColor: colors.isGlass ? Colors.transparent : colors.bg,
      fontFamily: AppFontFamilies.sans,
      colorScheme: ColorScheme(
        brightness: brightness,
        primary: colors.accent,
        onPrimary: colors.onAccent,
        secondary: colors.gold,
        onSecondary: colors.navy,
        error: colors.danger,
        onError: colors.onAccent,
        // Owner 2026-10-15: Glass's own surface is see-through; every Material
        // popup (menus, dropdowns, pickers, sheets) that takes its colour from
        // here must be solid, so it uses the sheet colour in Glass.
        surface: colors.isGlass ? colors.sheet : colors.surface,
        onSurface: colors.text,
      ),
      extensions: <ThemeExtension<dynamic>>[
        colors,
        typography,
        ChatColors.forTokens(colors, brightness),
      ],
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
        hintStyle:
            typography.body.copyWith(color: colors.textSecondary, fontSize: 14),
        labelStyle: typography.bodySmall
            .copyWith(color: colors.textSecondary, fontSize: 13),
        floatingLabelStyle: typography.bodySmall
            .copyWith(color: colors.textSecondary, fontSize: 13),
        helperStyle: typography.caption.copyWith(color: colors.textSecondary),
        errorStyle: typography.caption.copyWith(color: colors.danger),
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
        backgroundColor: colors.sheet,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.sheet),
          side: BorderSide(color: colors.border),
        ),
        titleTextStyle:
            typography.roleTitle.copyWith(color: colors.text, fontSize: 16),
        contentTextStyle:
            typography.bodySmall.copyWith(color: colors.textSecondary),
        insetPadding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
        actionsPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      ),
      // Owner 2026-10-15: the date and time pickers sit on an opaque sheet
      // in every theme (Glass's own surface is see-through, which let the
      // form show through the calendar) and use the app's colours.
      datePickerTheme: DatePickerThemeData(
        backgroundColor: colors.sheet,
        surfaceTintColor: Colors.transparent,
        shadowColor: colors.shadow,
        headerBackgroundColor: colors.sheet,
        headerForegroundColor: colors.text,
        headerHeadlineStyle: typography.titleLarge.copyWith(color: colors.text),
        headerHelpStyle:
            typography.caption.copyWith(color: colors.textSecondary),
        weekdayStyle: typography.caption.copyWith(color: colors.textSecondary),
        dayStyle: typography.bodySmall,
        yearStyle: typography.bodySmall,
        dayForegroundColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? colors.onAccent
              : states.contains(WidgetState.disabled)
                  ? colors.textSecondary.withValues(alpha: 0.4)
                  : colors.text,
        ),
        dayBackgroundColor: WidgetStateProperty.resolveWith(
          (states) =>
              states.contains(WidgetState.selected) ? colors.accent : null,
        ),
        todayForegroundColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? colors.onAccent
              : colors.accent,
        ),
        todayBackgroundColor: WidgetStateProperty.resolveWith(
          (states) =>
              states.contains(WidgetState.selected) ? colors.accent : null,
        ),
        todayBorder: BorderSide(color: colors.accent),
        yearForegroundColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? colors.onAccent
              : colors.text,
        ),
        yearBackgroundColor: WidgetStateProperty.resolveWith(
          (states) =>
              states.contains(WidgetState.selected) ? colors.accent : null,
        ),
        dividerColor: colors.border,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.sheet),
          side: BorderSide(color: colors.border),
        ),
        cancelButtonStyle: TextButton.styleFrom(foregroundColor: colors.text),
        confirmButtonStyle:
            TextButton.styleFrom(foregroundColor: colors.accent),
      ),
      timePickerTheme: TimePickerThemeData(
        backgroundColor: colors.sheet,
        dialBackgroundColor: colors.chip,
        dialHandColor: colors.accent,
        dialTextColor: colors.text,
        hourMinuteColor: colors.chip,
        hourMinuteTextColor: colors.text,
        dayPeriodColor: colors.chip,
        dayPeriodTextColor: colors.text,
        entryModeIconColor: colors.textSecondary,
        helpTextStyle: typography.caption.copyWith(color: colors.textSecondary),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.sheet),
          side: BorderSide(color: colors.border),
        ),
        cancelButtonStyle: TextButton.styleFrom(foregroundColor: colors.text),
        confirmButtonStyle:
            TextButton.styleFrom(foregroundColor: colors.accent),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: colors.sheet,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.field),
          side: BorderSide(color: colors.border),
        ),
        textStyle: typography.body.copyWith(color: colors.text),
      ),
      menuTheme: MenuThemeData(
        style: MenuStyle(
          backgroundColor: WidgetStatePropertyAll(colors.sheet),
          surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent),
        ),
      ),
      dropdownMenuTheme: DropdownMenuThemeData(
        menuStyle: MenuStyle(
          backgroundColor: WidgetStatePropertyAll(colors.sheet),
          surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent),
        ),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        // The pull-to-refresh circle sits on this colour: solid in every theme.
        refreshBackgroundColor: colors.sheet,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          textStyle: typography.button,
          minimumSize: const Size(0, 36),
          padding: const EdgeInsets.symmetric(horizontal: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadii.button),
          ),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: colors.sheet,
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
          minimumSize: const Size(0, 36),
          padding: const EdgeInsets.symmetric(horizontal: 12),
        ),
      ),
    );
  }
}

/// Reduce motion: the new route appears at once (no slide, no fade); the
/// edge-swipe back of the Cupertino builder is kept out on purpose — it is
/// itself an animation.
class _NoMotionTransitionsBuilder extends PageTransitionsBuilder {
  const _NoMotionTransitionsBuilder();

  @override
  Duration get transitionDuration => Duration.zero;

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) =>
      child;
}
