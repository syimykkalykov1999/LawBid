/// Path constants for go_router. Centralized here (never a string literal at
/// a `context.go(...)` call site) so a path rename is a one-line change.
abstract final class AppRoutes {
  static const feed = '/feed';
  static const search = '/search';
  static const mine = '/mine';
  static const profile = '/profile';

  /// Full-screen "+" creation flow (file 07 §3.4: "Экран открывается как
  /// full-screen с крестиком") — pushed on the ROOT navigator, not a shell
  /// branch, so it covers the bottom nav entirely.
  static const create = '/create';
}
