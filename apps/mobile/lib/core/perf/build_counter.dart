/// Owner 2026-10-26 (smoothness): debug-only build counters, so widget
/// tests can prove a scroll or a typing event rebuilds less. Every call
/// sits inside an `assert`, so profile and release builds do nothing.
abstract final class BuildCounter {
  static final Map<String, int> _counts = {};

  /// Counts one build of [name] (debug builds and tests only).
  static void hit(String name) {
    assert(
      () {
        _counts[name] = (_counts[name] ?? 0) + 1;
        return true;
      }(),
      '',
    );
  }

  /// How many times [name] was built since the last [reset].
  static int of(String name) => _counts[name] ?? 0;

  static void reset() => _counts.clear();
}
