// Component size tokens (UI modernization pass, 2026-09-27). Plain const
// class for the same reason as AppSpacing: sizes don't vary by theme. All
// values sit on the 4pt grid except where a platform minimum applies.
abstract final class AppSizes {
  /// Minimum touch target (file 07 §9 / WCAG 2.5.8): 44x44.
  static const double touchTarget = 44;

  /// Icon sizes.
  static const double iconSm = 20;
  static const double iconMd = 24;
  static const double iconLg = 28;

  /// Circular icon badge in list rows (settings, device cards).
  static const double rowMedallion = 40;

  /// Circular icon badge on empty / error / offline states.
  static const double stateMedallion = 88;
  static const double stateIcon = 36;

  /// Top bar height.
  static const double topBar = 56;

  /// Bottom-sheet drag handle.
  static const double sheetHandleWidth = 36;
  static const double sheetHandleHeight = 4;

  /// Bottom nav: selected-tab pill behind the icon.
  static const double navIndicatorWidth = 56;
  static const double navIndicatorHeight = 28;

  /// Height of one segment of a step-progress bar.
  static const double progressSegment = 4;

  /// Max width of the empty/error state's call-to-action button.
  static const double stateActionWidth = 200;

  /// Soft card shadow blur / offset.
  static const double cardShadowBlur = 16;
  static const double cardShadowOffsetY = 4;
}
