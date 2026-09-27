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
  // --- UI modernization pass (2026-09-27) --------------------------------
  // Derived from the approved palette above (same hues, alpha only) — no
  // new brand colors. Used for elevation, tinted icon medallions and the
  // skeleton shimmer on non-welcome screens.

  /// Soft navy-tinted card/nav shadow.
  static const Color shadow = Color(0x0F0A1A3F);

  /// Gold at ~12% — medallion / selected-row fill.
  static const Color goldTint = Color(0x1FC9A24A);

  /// Danger at ~10% — destructive medallion fill.
  static const Color dangerTint = Color(0x1AD64545);

  /// Success at ~10% (derived from [AppColorsStatus.success]).
  static const Color successTint = Color(0x1A1F9D67);

  /// Info at ~10% (derived from [AppColorsStatus.info]).
  static const Color infoTint = Color(0x1A2F80ED);

  /// Skeleton base + moving highlight.
  static const Color skeletonBase = Color(0xFFEEF1F7);
  static const Color skeletonHighlight = Color(0xFFF8F9FC);

  /// Foreground on a filled danger button.
  static const Color onDanger = Color(0xFFFFFFFF);

  /// Readable danger for TEXT on `bg`/`surface` (p12 leaf-1.6, docs/01
  /// §8.4 WCAG AA): the spec `danger` #D64545 is 4.38:1 on white — just
  /// under 4.5. Same hue, darker: 5.20:1. Used for destructive labels
  /// inside the app; `danger` itself stays the spec value.
  static const Color dangerText = Color(0xFFC53A3A);
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
  // --- UI modernization pass (2026-09-27) — see AppColorsLight. ---------
  static const Color shadow = Color(0x66000000);
  static const Color goldTint = Color(0x26C9A24A);
  static const Color dangerTint = Color(0x26D64545);
  static const Color successTint = Color(0x261F9D67);
  static const Color infoTint = Color(0x262F80ED);
  static const Color skeletonBase = Color(0xFF1E1E24);
  static const Color skeletonHighlight = Color(0xFF2A2A31);
  static const Color onDanger = Color(0xFFFFFFFF);

  /// Lighter danger for text on the dark `bg`/`surface`: 5.87:1 / 5.39:1
  /// (spec #D64545 is 4.49:1 / 4.12:1). See [AppColorsLight.dangerText].
  static const Color dangerText = Color(0xFFE36464);
}

/// Status colors, shared by both themes: file 07 §2 says `danger`,
/// `success`, `warning` come "из файла 01, раздел 8.1", and 01 §8.1 lists
/// exactly these hex values (plus `info`). §8.1's dark table gives no
/// status values ("остальные семантические цвета аналогично
/// адаптируются"), so the spec hex is used in both themes; each clears
/// the WCAG 1.4.11 3:1 non-text minimum against the dark `bg`/`surface`
/// (on #0B0B0D: success 5.7:1, warning 7.1:1, info 5.1:1, danger 4.5:1).
/// Values pinned by test/design_system/theme/app_color_tokens_test.dart.
abstract final class AppColorsStatus {
  static const Color danger = Color(0xFFD64545);
  static const Color success = Color(0xFF1F9D67);
  static const Color warning = Color(0xFFD98A00);
  static const Color info = Color(0xFF2F80ED);

  /// Fill behind white text on a destructive button, both themes: white on
  /// the spec `danger` is 4.38:1 (< AA 4.5); this same-hue shade is 5.20:1.
  static const Color dangerFill = Color(0xFFC53A3A);
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
