import 'package:flutter/painting.dart' show Offset;

/// Owner 2026-10-22 (WhatsApp / Telegram): the hold-to-record mic.
///
/// Press and hold starts the recording; sliding the finger toward the start
/// side past `cancelDx` throws it away ("slide to cancel"); sliding UP past
/// `lockDy` locks it (hands-free, a send button appears); letting go in
/// between sends. The thresholds are the ones both apps use (~100 dp
/// sideways, ~80 dp up). Pure, so the pointer maths is testable.
enum HoldOutcome { none, cancel, lock }

abstract final class HoldGesture {
  static const double cancelDx = -110;
  static const double lockDy = -80;

  /// What the finger's total drag [drag] since the press means.
  static HoldOutcome classify(Offset drag) {
    if (drag.dx < cancelDx) return HoldOutcome.cancel;
    if (drag.dy < lockDy) return HoldOutcome.lock;
    return HoldOutcome.none;
  }

  /// "‹ slide to cancel" fades as the finger goes (0.2..1).
  static double slideOpacity(Offset drag) =>
      (1 + drag.dx / -cancelDx).clamp(0.2, 1.0);

  /// The lock hint above the mic brightens as the finger rises (0.4..1).
  static double lockHintOpacity(Offset drag) =>
      (0.4 + drag.dy / lockDy).clamp(0.4, 1.0);
}
