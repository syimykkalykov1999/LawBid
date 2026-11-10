import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/persistence/drift_web.dart';

/// Owner 2026-11-08 (speed everywhere, SPEED_MATRIX §3 №6): on the web the
/// cache database (HTTP copies, messages) is kept in the browser's storage
/// like the social database — a reload or a new tab opens on the copy —
/// instead of living only in the tab's memory.
void main() {
  test('the web cache database opens the browser storage, with a fallback', () {
    final cache = appDriftCacheDatabase('lawbid_cache', web: true);
    expect(isBrowserStorageExecutor(cache), isTrue);
    // The same opener the social database uses on the web.
    expect(
      cache.runtimeType,
      appDriftDatabase('lawbid_social', web: true).runtimeType,
    );
  });
}
