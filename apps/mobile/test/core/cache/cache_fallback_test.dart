import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';

/// Owner 2026-10-22 (plan §5): where the cache file cannot be opened (no
/// documents directory — as in every widget test), the cache works in
/// memory instead of failing every request that touches it.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('the default cache database falls back to memory', () async {
    final db = CacheDatabase();
    addTearDown(db.close);
    expect(await db.httpBytes(), 0);
    await db.putHttpEntry(
      key: 'k',
      etag: 'e',
      json: '{}',
      bytes: 2,
      now: DateTime(2026),
    );
    expect((await db.httpEntry('k'))?.etag, 'e');
  });
}
