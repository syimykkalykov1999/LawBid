// Component size tokens (UI modernization pass, 2026-09-27). Plain const
// class for the same reason as AppSpacing: sizes don't vary by theme. All
// values sit on the 4pt grid except where a platform minimum applies.
abstract final class AppSizes {
  /// Minimum touch target (file 07 §9 / WCAG 2.5.8): 44x44.
  static const double touchTarget = 44;

  /// Opacity of a control shown but not available (e.g. the role card
  /// that can no longer be picked, docs/01 §11 Шаг 2).
  static const double disabledOpacity = 0.4;

  /// Invisible hit/semantics area around controls whose VISUAL size is
  /// fixed below it by file 07 (44px icon buttons, 36px chips) — see
  /// `AppTapTarget`. 48 satisfies both iOS (44) and Android (48) minimums.
  static const double hitTarget = 48;

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

  /// Max text scale for bottom-nav labels (see AppBottomNav).
  static const double navLabelMaxTextScale = 1.35;

  /// Height of one segment of a step-progress bar.
  static const double progressSegment = 4;

  /// Max width of the empty/error state's call-to-action button.
  static const double stateActionWidth = 200;

  /// Soft card shadow blur / offset.
  static const double cardShadowBlur = 16;
  static const double cardShadowOffsetY = 4;

  // --- p12 leaf-1.6 (docs/01 §8.3 offline + pagination, docs/07 §10) ------

  /// Feed header. Owner decision 2026-09-29 (OQ-027): centered text
  /// wordmark "LawBid" instead of the scales logo, and a lower bar.
  static const double feedHeaderLogo = 96;
  static const double feedHeader = 52;
  static const double feedWordmark = 26;

  /// Segmented tabs (owner 2026-09-29): row height.
  static const double segmentedTabs = 44;

  /// The big search field at the top of the Search tab (owner 2026-09-29).
  static const double searchField = 56;

  /// Bottom nav: rounded top corners (owner 2026-09-29).
  static const double bottomNavRadius = 18;

  /// Offline banner row (icon + one line at 100% text scale).
  static const double bannerMinHeight = 44;

  /// Pagination footer spinner.
  static const double footerSpinner = 20;
  static const double footerSpinnerStroke = 2;

  /// Author/avatar size on content (post/case) cards.
  static const double cardAvatar = 40;

  /// Status dot on the offline banner / content cards.
  static const double statusDot = 8;
}
