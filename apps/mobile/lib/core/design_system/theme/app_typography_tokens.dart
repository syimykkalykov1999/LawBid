import 'package:flutter/material.dart';

import '../tokens/app_fonts.dart';

/// Design-system type scale (file 07 §3). Access via
/// `Theme.of(context).extension<AppTypographyTokens>()!`.
///
/// Styles intentionally carry no [Color] — callers apply color from
/// [AppColorTokens] for the context they're used in (e.g. `body` on `bg`
/// vs. `onAccent` inside a filled button). This keeps typography and color
/// as independent, orthogonal tokens.
///
/// Sizes are logical pixels and scale with the system text-size setting up
/// to 200% (file 07 §9) because they're plain `fontSize` values consumed
/// through Flutter's normal text-scaling pipeline — consuming widgets must
/// avoid fixed-height boxes that would clip at that scale (see AppButton /
/// AppOtpField / AppBottomNav sizing notes).
@immutable
final class AppTypographyTokens extends ThemeExtension<AppTypographyTokens> {
  const AppTypographyTokens({
    required this.titleLarge,
    required this.titleMedium,
    required this.titleWelcome,
    required this.roleTitle,
    required this.otpDigit,
    required this.body,
    required this.bodySmall,
    required this.button,
    required this.caption,
    required this.legalFine,
    required this.badge,
  });

  factory AppTypographyTokens.standard() => const AppTypographyTokens(
        titleLarge: TextStyle(
          fontFamily: AppFontFamilies.serif,
          fontWeight: FontWeight.w600,
          fontSize: 26,
          height: 1.2,
        ),
        titleMedium: TextStyle(
          fontFamily: AppFontFamilies.serif,
          fontWeight: FontWeight.w600,
          fontSize: 24,
          height: 1.2,
        ),
        titleWelcome: TextStyle(
          fontFamily: AppFontFamilies.serif,
          fontWeight: FontWeight.w600,
          fontSize: 21,
          height: 1.28,
        ),
        roleTitle: TextStyle(
          fontFamily: AppFontFamilies.serif,
          fontWeight: FontWeight.w600,
          fontSize: 17,
        ),
        otpDigit: TextStyle(
          fontFamily: AppFontFamilies.serif,
          fontWeight: FontWeight.w600,
          fontSize: 22,
        ),
        body: TextStyle(
          fontFamily: AppFontFamilies.sans,
          fontWeight: FontWeight.w400,
          fontSize: 14,
          height: 1.5,
        ),
        bodySmall: TextStyle(
          fontFamily: AppFontFamilies.sans,
          fontWeight: FontWeight.w400,
          fontSize: 13,
          height: 1.45,
        ),
        button: TextStyle(
          fontFamily: AppFontFamilies.sans,
          fontWeight: FontWeight.w600,
          fontSize: 15,
        ),
        caption: TextStyle(
          fontFamily: AppFontFamilies.sans,
          fontWeight: FontWeight.w400,
          fontSize: 11,
          height: 1.5,
        ),
        legalFine: TextStyle(
          fontFamily: AppFontFamilies.sans,
          fontWeight: FontWeight.w400,
          fontSize: 10,
          height: 1.45,
        ),
        badge: TextStyle(
          fontFamily: AppFontFamilies.sans,
          fontWeight: FontWeight.w600,
          fontSize: 10.5,
        ),
      );

  final TextStyle titleLarge;
  final TextStyle titleMedium;
  final TextStyle titleWelcome;
  final TextStyle roleTitle;
  final TextStyle otpDigit;
  final TextStyle body;
  final TextStyle bodySmall;
  final TextStyle button;
  final TextStyle caption;
  final TextStyle legalFine;
  final TextStyle badge;

  @override
  AppTypographyTokens copyWith({
    TextStyle? titleLarge,
    TextStyle? titleMedium,
    TextStyle? titleWelcome,
    TextStyle? roleTitle,
    TextStyle? otpDigit,
    TextStyle? body,
    TextStyle? bodySmall,
    TextStyle? button,
    TextStyle? caption,
    TextStyle? legalFine,
    TextStyle? badge,
  }) {
    return AppTypographyTokens(
      titleLarge: titleLarge ?? this.titleLarge,
      titleMedium: titleMedium ?? this.titleMedium,
      titleWelcome: titleWelcome ?? this.titleWelcome,
      roleTitle: roleTitle ?? this.roleTitle,
      otpDigit: otpDigit ?? this.otpDigit,
      body: body ?? this.body,
      bodySmall: bodySmall ?? this.bodySmall,
      button: button ?? this.button,
      caption: caption ?? this.caption,
      legalFine: legalFine ?? this.legalFine,
      badge: badge ?? this.badge,
    );
  }

  @override
  AppTypographyTokens lerp(covariant AppTypographyTokens? other, double t) {
    if (other is! AppTypographyTokens) return this;
    return AppTypographyTokens(
      titleLarge: TextStyle.lerp(titleLarge, other.titleLarge, t)!,
      titleMedium: TextStyle.lerp(titleMedium, other.titleMedium, t)!,
      titleWelcome: TextStyle.lerp(titleWelcome, other.titleWelcome, t)!,
      roleTitle: TextStyle.lerp(roleTitle, other.roleTitle, t)!,
      otpDigit: TextStyle.lerp(otpDigit, other.otpDigit, t)!,
      body: TextStyle.lerp(body, other.body, t)!,
      bodySmall: TextStyle.lerp(bodySmall, other.bodySmall, t)!,
      button: TextStyle.lerp(button, other.button, t)!,
      caption: TextStyle.lerp(caption, other.caption, t)!,
      legalFine: TextStyle.lerp(legalFine, other.legalFine, t)!,
      badge: TextStyle.lerp(badge, other.badge, t)!,
    );
  }
}
