// 4px grid spacing tokens (file 07 §4: "Сетка кратна 4. Боковые отступы экрана 22.").
// Plain const class, not a ThemeExtension: spacing does not vary by theme brightness
// and does not need BuildContext — see stage 1.5 architecture review in CHANGELOG.md.
abstract final class AppSpacing {
  static const double unit = 4;

  static const double xs = unit; // 4
  static const double sm = unit * 2; // 8
  static const double md = unit * 3; // 12
  static const double lg = unit * 4; // 16
  static const double xl = unit * 6; // 24
  static const double xxl = unit * 8; // 32

  /// Side padding for full screens (file 07 §4).
  static const double screenSide = 22;

  /// Gap between role cards (file 07 §4).
  static const double roleCardGap = 12;
}
