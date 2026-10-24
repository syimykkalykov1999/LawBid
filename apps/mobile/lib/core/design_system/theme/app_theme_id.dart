import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_colors.dart';

/// The themes a user can pick (owner 2026-10-22). Adding a theme = one new
/// value here + one [AppThemeSpec] in [AppThemes] + its tokens in
/// [AppColorTokens]; the pickers read the registry, nothing else changes.
enum AppThemeId { day, night, blue, green }

/// One theme: how it is stored, shown and built.
@immutable
final class AppThemeSpec {
  const AppThemeSpec({
    required this.id,
    required this.wire,
    required this.serverWire,
    required this.brightness,
    required this.nameKey,
    required this.descKey,
    required this.tokens,
    required this.previewBg,
    required this.previewBgGradient,
    required this.previewTitle,
    required this.previewAccent,
  });

  final AppThemeId id;

  /// Stored on the phone.
  final String wire;

  /// `users.theme` on the server (`ThemePref`): light / dark / blue / green.
  final String serverWire;

  /// Material brightness (dark themes use the dark system chrome).
  final Brightness brightness;

  /// Translation keys of the name and the one-line description.
  final String nameKey;
  final String descKey;

  /// Builds the tokens of this theme.
  final AppColorTokens Function() tokens;

  /// The small swatch of the picker row.
  final Color previewBg;
  final List<Color>? previewBgGradient;
  final Color previewTitle;
  final Color previewAccent;
}

abstract final class AppThemes {
  static const List<AppThemeSpec> all = [
    AppThemeSpec(
      id: AppThemeId.day,
      wire: 'day',
      serverWire: 'light',
      brightness: Brightness.light,
      nameKey: 'theme.day.name',
      descKey: 'theme.day.desc',
      tokens: AppColorTokens.light,
      previewBg: AppColorsLight.bg,
      previewBgGradient: null,
      previewTitle: AppColorsLight.navy,
      previewAccent: AppColorsLight.gold,
    ),
    AppThemeSpec(
      id: AppThemeId.night,
      wire: 'night',
      serverWire: 'dark',
      brightness: Brightness.dark,
      nameKey: 'theme.night.name',
      descKey: 'theme.night.desc',
      tokens: AppColorTokens.dark,
      previewBg: AppColorsDark.bg,
      previewBgGradient: null,
      previewTitle: AppColorsDark.text,
      previewAccent: AppColorsDark.gold,
    ),
    AppThemeSpec(
      id: AppThemeId.blue,
      wire: 'blue',
      serverWire: 'blue',
      brightness: Brightness.dark,
      nameKey: 'theme.blue.name',
      descKey: 'theme.blue.desc',
      tokens: AppColorTokens.blue,
      previewBg: AppColorsBlue.bg,
      previewBgGradient: null,
      previewTitle: AppColorsBlue.text,
      previewAccent: AppColorsBlue.accent,
    ),
    AppThemeSpec(
      id: AppThemeId.green,
      wire: 'green',
      serverWire: 'green',
      brightness: Brightness.dark,
      nameKey: 'theme.green.name',
      descKey: 'theme.green.desc',
      tokens: AppColorTokens.green,
      previewBg: AppColorsGreen.bg,
      previewBgGradient: null,
      previewTitle: AppColorsGreen.text,
      previewAccent: AppColorsGreen.accent,
    ),
  ];

  static AppThemeSpec of(AppThemeId id) => all.firstWhere((s) => s.id == id);

  /// The stored value → a theme; the legacy `light`/`dark` and the old
  /// "follow the system" (`system`, null) are read as Day / Night / auto.
  static AppThemeId? fromWire(String? raw) {
    for (final s in all) {
      if (s.wire == raw) return s.id;
    }
    return switch (raw) {
      'light' => AppThemeId.day,
      'dark' => AppThemeId.night,
      // Owner 2026-10-22: the old Navy is the Blue theme; the removed
      // Glass theme becomes Night.
      'navy' => AppThemeId.blue,
      'glass' => AppThemeId.night,
      _ => null,
    };
  }

  /// `users.theme` → a theme (null = the account follows the system).
  static AppThemeId? fromServer(String? raw) {
    for (final s in all) {
      if (s.serverWire == raw) return s.id;
    }
    // Rows written by older apps: navy was Blue, glass is Night.
    return switch (raw) {
      'navy' => AppThemeId.blue,
      'glass' => AppThemeId.night,
      _ => null,
    };
  }

  /// Day or Night by the phone's own brightness (a user who never chose).
  static AppThemeId autoFor(Brightness platform) =>
      platform == Brightness.dark ? AppThemeId.night : AppThemeId.day;
}
