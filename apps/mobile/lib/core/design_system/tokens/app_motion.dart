// ignore_for_file: lines_longer_than_80_chars
// Motion durations/curves used across the design system (file 07 §4, §5.2, §7.3).
// Plain const class — durations/curves don't vary by theme.
import 'package:flutter/animation.dart';
import 'package:flutter/material.dart' show Durations, Easing;

abstract final class AppMotion {
  /// AppButton / RoleCard press-scale (file 07 §4: "Нажатие: масштаб 0.98 за 120 мс").
  static const Duration pressScale = Duration(milliseconds: 120);
  static const double pressScaleFactor = 0.98;

  /// RoleCard checkmark fade/scale-in (file 07 §4: "150 мс").
  static const Duration roleCardCheckmark = Duration(milliseconds: 150);

  /// Gavel-strike total animation length (file 07 §7.3).
  static const Duration gavelStrike = Duration(milliseconds: 620);
  static const Curve gavelStrikeCurve = Cubic(0.45, 0, 0.7, 0.35);

  /// Delay from tap to the button's onPressed firing (file 07 §7.3: "~700 мс").
  static const Duration gavelActionDelay = Duration(milliseconds: 700);

  /// Progress fraction of [gavelStrike] at which the "hit" occurs (file 07 §7.3: "52%").
  static const double gavelHitProgress = 0.52;

  /// Strike-ring overlay: starts 300ms into the sequence, scales over 500ms (file 07 §7.2).
  static const Duration gavelRingStart = Duration(milliseconds: 300);
  static const Duration gavelRingDuration = Duration(milliseconds: 500);

  // --- UI modernization pass (2026-09-27, docs/CHANGELOG.md) -------------
  // Direction: "Trust & Authority" (ui-ux-pro-max): calm, confident motion.
  // Enter 280-360ms with a decelerating curve, exit faster than enter,
  // small travel distances (no bouncy overshoot on a legal product). Every
  // consumer must skip motion when `MediaQuery.disableAnimations` is set —
  // see `AppMotionContext.reduceMotion` in widgets/motion/app_entrance.dart.

  /// Standard decelerate curve for things arriving on screen.
  static const Curve enterCurve = Curves.easeOutCubic;

  /// Standard accelerate curve for things leaving the screen.
  static const Curve exitCurve = Curves.easeInCubic;

  /// Push/pop page transition (go_router `CustomTransitionPage`).
  static const Duration pageEnter = Duration(milliseconds: 320);
  static const Duration pageExit = Duration(milliseconds: 240);

  /// Horizontal travel of a pushed page, as a fraction of its width.
  static const double pageSlideFraction = 0.08;

  /// Vertical travel of a full-screen modal (the "+" create flow).
  static const double modalSlideFraction = 0.12;

  /// Staggered entrance of screen content (fade + short rise).
  static const Duration entrance = Duration(milliseconds: 360);
  static const Duration entranceStagger = Duration(milliseconds: 55);

  /// Rise distance of an entering element, as a fraction of its own height.
  static const double entranceRise = 0.18;

  /// Starting scale of an entering medallion (empty/error states).
  static const double entranceScaleFrom = 0.88;

  /// Small state changes: selection pills, tab indicator, row highlight.
  static const Duration stateChange = Duration(milliseconds: 220);

  /// Cross-fade between steps of a multi-step flow (delete account).
  static const Duration stepSwitch = Duration(milliseconds: 300);

  /// One full sweep of the skeleton shimmer highlight.
  static const Duration shimmer = Duration(milliseconds: 1400);

  // --- p12 leaf-1.6: offline banner + pagination (docs/01 §8.3) -----------

  /// Offline banner sliding down from under the status bar / collapsing
  /// back (exit faster than enter).
  static const Duration bannerEnter = Duration(milliseconds: 320);
  static const Duration bannerExit = Duration(milliseconds: 220);

  /// How long the "back online" confirmation stays before collapsing.
  static const Duration restoredHold = Duration(milliseconds: 2000);

  /// Cross-fade between pagination footer states (loading / error / end).
  static const Duration footerSwitch = Duration(milliseconds: 200);

  // --- Owner row 88 (2026-11-13): smoother motion, look unchanged --------

  /// Bottom sheets: Material 3 tokens from Flutter's `material/motion.dart`
  /// (BSD-3) — emphasized decelerate in (medium3, 350 ms), emphasized
  /// accelerate out (medium1, 250 ms) instead of Flutter's legacy 250/200.
  static const Duration sheetEnter = Durations.medium3;
  static const Duration sheetExit = Durations.medium1;
  static const Curve sheetEnterCurve = Easing.emphasizedDecelerate;
  static const Curve sheetExitCurve = Easing.emphasizedAccelerate;

  /// Something let go of glides back (a photo dragged down, a quoted
  /// bubble): the Material 3 standard "fast spatial" spring, stiffness 1400
  /// with damping ratio 0.9 (no bounce, as above), built with Flutter's
  /// `SpringDescription.withDampingRatio` (BSD-3).
  static final SpringDescription snapBackSpring =
      SpringDescription.withDampingRatio(mass: 1, stiffness: 1400, ratio: 0.9);

  // --- Owner row 95 (2026-11-13): motion catalog batch --------------------
  // Numbers from docs/dev/MOTION_CATALOG_2026-11-13.md §0 (Flutter SDK,
  // BSD-3). Pure animation physics, so code constants (owner rule 13.11).

  /// Something small pops in (a checkmark, a reaction chip, an unread
  /// badge): 0.6 → 1 with `easeOutBack`, 200 ms (catalog F6 / M6 / C7).
  static const Duration popIn = Duration(milliseconds: 200);
  static const double popScaleFrom = 0.6;
  static const Curve popCurve = Curves.easeOutBack;

  /// Message ticks sent → delivered → read: 150 ms fade + scale, colour
  /// 200 ms (catalog M3).
  static const Duration tickSwitch = Duration(milliseconds: 150);
  static const Duration tickColor = Duration(milliseconds: 200);

  /// Material `SnackBar` in/out, `material/snack_bar.dart:28-29` (catalog T2).
  static const Duration toastEnter = Duration(milliseconds: 250);
  static const Duration toastExit = Duration(milliseconds: 250);

  /// Row insert / remove: `AnimatedList` default, `animated_scroll_view.dart`
  /// :941 (catalog C3 / C4 / M14).
  static const Duration listChange = Duration(milliseconds: 300);

  /// Top banners (in-app message, incoming call): slide down 300 ms
  /// emphasized decelerate, up 200 ms emphasized accelerate (catalog T1 /
  /// CA2, `material/motion.dart`).
  static const Duration topBannerEnter = Durations.medium2;
  static const Duration topBannerExit = Durations.short4;
  static const Curve topBannerEnterCurve = Easing.emphasizedDecelerate;
  static const Curve topBannerExitCurve = Easing.emphasizedAccelerate;

  /// Long-press preview / context menu: `CupertinoContextMenu` popup
  /// 335 ms, lift `easeOutBack` in / `easeInBack` out
  /// (`cupertino/context_menu.dart:37, 789-790`).
  static const Duration contextMenuOpen = Duration(milliseconds: 335);
  static const Curve contextMenuLiftIn = Curves.easeOutBack;
  static const Curve contextMenuLiftOut = Curves.easeInBack;

  /// Error shake: 4 horizontal swings of ±8 px in 400 ms (catalog
  /// F3; the iOS passcode-field shake, `flutter_animate` `ShakeEffect`).
  static const Duration shake = Duration(milliseconds: 400);
  static const double shakeOffset = 8;
  static const int shakeSwings = 4;

  /// Number roll of a counter (likes, views): 250 ms (catalog C6, iOS 17
  /// `contentTransition(.numericText())`).
  static const Duration counterRoll = Duration(milliseconds: 250);

  /// A quick reaction heart that pops on a double tap (catalog G13).
  static const Duration quickReactionPop = Duration(milliseconds: 450);
}
