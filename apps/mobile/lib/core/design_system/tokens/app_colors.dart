// Raw color values for LawBid's design system (file 07, §2).
// These are the ONLY place hex/ARGB literals may appear. Every widget must read
// colors through [AppColorTokens] (see ../theme/app_color_tokens.dart), never
// import this file directly, with exactly one documented exception below.
import 'package:flutter/widgets.dart';

/// Light-theme raw palette (file 07 §2, "Светлая" column).
abstract final class AppColorsLight {
  static const Color bg = Color(0xFFFFFFFF);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color text = Color(0xFF0B1330);
  static const Color textSecondary = Color(0xFF5B6784);
  static const Color border = Color(0xFFDDE2EE);
  static const Color accent = Color(0xFF0A1A3F);
  static const Color onAccent = Color(0xFFFFFFFF);

  /// Owner-requested brighter CTA pair (2026-09-22, dark theme -- see
  /// [AppColorsDark.ctaBright]'s doc comment for why this exists). Light
  /// theme was never part of that complaint, so these just mirror
  /// [accent]/[onAccent] unchanged -- no visible difference here.
  static const Color ctaBright = accent;
  static const Color onCtaBright = onAccent;
  static const Color gold = Color(0xFFC9A24A);
  static const Color goldStroke = Color(0xFFB08A2E);
  static const Color goldLight = Color(0xFFE3C877);
  static const Color goldDark = Color(0xFF8E6F26);
  static const Color navy = Color(0xFF0A1A3F);
  static const Color panFill = Color(0xFF0A1A3F);
  /// White (2026-09-22 owner follow-up): was `#E3C877` (gold), same gold
  /// as [goldLight] -- owner asked for the "Law"/"Bid" pan word to read
  /// white against the navy [panFill], light theme only. Dark theme's
  /// pan text stays its existing navy-on-gold, untouched.
  static const Color panText = Color(0xFFFFFFFF);
  static const double watermarkOpacity = 0.07;

  /// A11y mitigation (docs/CHANGELOG.md stage 1.5): the approved gold border
  /// (#C9A24A on white/`surface`) measures 2.40:1, below the 3:1 WCAG 2.2 SC
  /// 1.4.11 non-text-contrast minimum for a focus/selection boundary. The
  /// gold value itself is NOT changed (owner-approved, file 07 says not to
  /// alter it without asking). Instead a soft gold glow shadow is added
  /// around the focused field / selected card in light theme only, as a
  /// second, non-color-dependent visual cue. Not needed in dark theme,
  /// where the gold border already measures 7.51:1.
  static const Color focusRingGlow = Color(0x40C9A24A);
}

/// Dark-theme raw palette (file 07 §2, "Тёмная" column).
abstract final class AppColorsDark {
  static const Color bg = Color(0xFF0B0B0D);
  static const Color surface = Color(0xFF16161B);
  static const Color text = Color(0xFFF3EFE3);
  static const Color textSecondary = Color(0xFF9A9AA6);
  static const Color border = Color(0xFF2A2A31);
  static const Color accent = Color(0xFFC9A24A);
  static const Color onAccent = Color(0xFF0B0B0D);

  /// Owner follow-up (2026-09-22): the gold [accent] read too dull/dark
  /// for the welcome screen's phone button in dark theme -- asked for a
  /// brighter color, settled on white. Scoped as its own token pair
  /// (`AppButtonVariant.ctaBright` in app_button.dart) rather than
  /// changing [accent] itself, since [accent] also drives the bottom nav
  /// selection color and every OTHER primary button (role/phone/otp
  /// screens, error-state retry) that the owner did not ask to change.
  static const Color ctaBright = Color(0xFFFFFFFF);
  static const Color onCtaBright = Color(0xFF0B0B0D);
  static const Color gold = Color(0xFFC9A24A);
  static const Color goldStroke = Color(0xFFD4AF5A);
  static const Color goldLight = Color(0xFFE3C877);
  static const Color goldDark = Color(0xFF8E6F26);
  static const Color navy = Color(0xFF0A1A3F);
  /// White (2026-09-22 owner follow-up, same message as [ctaBright]): was
  /// `#C9A24A` (gold) -- owner found the pan fill too dull alongside the
  /// gold accent button and asked for a brighter color on both, settled
  /// on white. [panText] (navy) already reads fine against it, unchanged.
  static const Color panFill = Color(0xFFFFFFFF);
  static const Color panText = Color(0xFF0A1A3F);
  static const double watermarkOpacity = 0.10;

  /// Not needed in dark theme — see [AppColorsLight.focusRingGlow].
  static const Color focusRingGlow = Color(0x00000000);
}

/// Status colors, shared by both themes (file 01 §8.1, reused unchanged by file 07).
abstract final class AppColorsStatus {
  static const Color danger = Color(0xFFD64545);
  static const Color success = Color(0xFF2E9E5B);
  static const Color warning = Color(0xFFC98A1F);
}

/// LINT-EXEMPT: approved non-themed brand exception — file 07 §2:
/// "Карточка «Адвокат» (выбор роли) всегда тёмно-синяя #0A1A3F ... в обеих темах."
/// The Attorney role card's navy background and its `#C9D2EA` description text do
/// NOT follow the light/dark [AppColorTokens] — they are fixed regardless of theme.
/// Consumed directly ONLY by RoleCard's attorney variant. Do not reuse elsewhere;
/// do not fold into [AppColorTokens] (that would make it theme-lerp'd, which the
/// spec explicitly forbids for this one card).
abstract final class AppColorsFixed {
  static const Color attorneyCardNavy = Color(0xFF0A1A3F);
  static const Color attorneyCardDescriptionText = Color(0xFFC9D2EA);
  static const Color attorneyCardTitleText = Color(0xFFFFFFFF);
  /// Attorney card's nested gold border: `rgba(201,162,74,.55)`, file 07 §2.
  static const Color attorneyCardGoldBorder = Color(0x8CC9A24A);
}
