// ignore_for_file: lines_longer_than_80_chars
// Corner radii (file 07 §4). Plain const class — see app_spacing.dart for rationale.
abstract final class AppRadii {
  static const double button = 14;
  static const double field = 12;
  static const double roleCard = 16;
  static const double otpCell = 12;
  static const double proBadge = 6;
  static const double chip =
      52 / 2; // country-code chip: pill, matches field height

  /// Content cards (settings groups, device rows) — same 16 as [roleCard]
  /// so every card-shaped surface in the app shares one corner language.
  static const double card = 16;

  /// Top corners of modal bottom sheets.
  static const double sheet = 24;

  /// Fully-rounded pills (tab indicator, drag handle, progress segments).
  static const double pill = 999;
}
