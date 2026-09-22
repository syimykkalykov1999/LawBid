/// Ensures at most one `/auth/refresh` call is in flight at a time, no
/// matter how many requests hit `TOKEN_EXPIRED` concurrently
/// (docs/01_FOUNDATION_AUTH.md §15 manual QA item "параллельные запросы не
/// ломаются"). Every caller that arrives while a refresh is already running
/// awaits the SAME future instead of firing its own `/auth/refresh` call —
/// which matters because the backend's refresh-token rotation treats a
/// second concurrent use of the same refresh token as reuse (potential
/// theft) and revokes the whole session chain for it.
class RefreshCoordinator {
  Future<String>? _inFlight;

  /// Runs [doRefresh] if no refresh is currently in flight, otherwise
  /// returns the in-flight call's result. [doRefresh] must resolve to the
  /// new access token, or throw on failure — every waiting caller sees the
  /// same success or the same error.
  Future<String> run(Future<String> Function() doRefresh) {
    final existing = _inFlight;
    if (existing != null) return existing;

    final future = doRefresh().whenComplete(() => _inFlight = null);
    _inFlight = future;
    return future;
  }
}
