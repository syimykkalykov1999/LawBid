import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';

/// Owner 2026-10-15: the gold text and marks of the Boost screens must read
/// in every theme (the plain `goldDark` is a Day colour; on the dark and
/// glass themes it is too dim on the gold tint, and `gold` itself is too
/// pale for a mark on Day).
extension BoostColors on AppColorTokens {
  /// The gold tint as it looks over the card.
  Color get boostTint => Color.alphaBlend(goldTint, practiceCardBase(this));

  /// Gold text on the tint (or on [bg]).
  Color boostInk([Color? bg]) => readableOn(goldDark, bg ?? boostTint);

  /// A gold mark (step bar, chart bar, chosen frame) on [bg], 3:1.
  Color boostMark([Color? bg]) =>
      readableOn(gold, bg ?? practiceCardBase(this), min: 3);
}
