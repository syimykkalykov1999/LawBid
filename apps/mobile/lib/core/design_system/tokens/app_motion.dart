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
}
