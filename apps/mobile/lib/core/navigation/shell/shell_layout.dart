import 'package:flutter/foundation.dart' show kIsWeb, visibleForTesting;

/// Owner 2026-10-15 (web): how the main shell lays out its navigation.
enum ShellLayout {
  /// The phone's floating bar at the bottom.
  bottom,

  /// A column of icons at the side (tablet-width windows).
  rail,

  /// A column with icons and names, and the content in a centred column
  /// (laptop and desktop windows).
  extendedRail,
}

/// Below this width the phone layout stays.
const double kShellRailMinWidth = 600;

/// From this width the column shows names and the content is centred.
const double kShellExtendedMinWidth = 840;

/// The widest the content column gets on a wide screen.
const double kShellContentMaxWidth = 680;

/// Switched with `--dart-define=ADAPTIVE_SHELL=true|false`; by default only
/// the web build adapts (phones and tablets keep the layout they have).
const bool kAdaptiveShell =
    bool.fromEnvironment('ADAPTIVE_SHELL', defaultValue: kIsWeb);

/// Tests set this to see the web layout on the VM.
@visibleForTesting
bool? adaptiveShellOverride;

/// The layout for a window [width] wide.
ShellLayout shellLayoutFor(double width, {bool adaptive = kAdaptiveShell}) {
  if (!adaptive || width < kShellRailMinWidth) return ShellLayout.bottom;
  return width < kShellExtendedMinWidth
      ? ShellLayout.rail
      : ShellLayout.extendedRail;
}

/// Owner 2026-10-15 (web): sheets and dialogs open over the content column
/// (same edges, same widest width), not over the whole window.
///
/// Measured from the view, not from MediaQuery: inside the content column
/// the query already holds the column's own size.
({double shift, double? maxWidth}) contentColumnBounds(
  double windowWidth, {
  bool? adaptive,
}) {
  switch (shellLayoutFor(
    windowWidth,
    adaptive: adaptive ?? adaptiveShellOverride ?? kAdaptiveShell,
  )) {
    case ShellLayout.bottom:
      return (shift: 0, maxWidth: null);
    case ShellLayout.rail:
      return (
        shift: kShellRailWidth / 2,
        maxWidth: windowWidth - kShellRailWidth
      );
    case ShellLayout.extendedRail:
      final free = windowWidth - kShellExtendedWidth;
      return (
        shift: kShellExtendedWidth / 2,
        maxWidth: free < kShellContentMaxWidth ? free : kShellContentMaxWidth,
      );
  }
}

/// The side column widths, as in the side nav.
const double kShellRailWidth = 76;
const double kShellExtendedWidth = 220;
