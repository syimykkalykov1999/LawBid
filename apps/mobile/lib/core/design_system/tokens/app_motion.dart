// Motion durations/curves used across the design system (file 07 §4, §5.2, §7.3).
// Plain const class — durations/curves don't vary by theme.
import 'package:flutter/animation.dart';

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
}
