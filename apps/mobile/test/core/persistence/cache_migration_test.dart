import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift_dev/api/migrations_native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';

import 'generated_migrations/cache/schema.dart';

/// S15-5: the cache database (http cache, messages, translations, file views)
/// against its checked-in schema dumps
/// (`drift_schemas/cache/`, made by `dart run drift_dev schema dump`).
/// Bump `schemaVersion`, run the dump, add the new step here.
void main() {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
  late SchemaVerifier verifier;

  setUpAll(() => verifier = SchemaVerifier(GeneratedHelper()));

  for (final from in [1]) {
    test('upgrade from v$from to v2 keeps the schema exact', () async {
      final schema = await verifier.schemaAt(from);
      final db = CacheDatabase(schema.newConnection());
      await verifier.migrateAndValidate(db, 2);
      await db.close();
    });
  }
  test('the current schema (v2) matches its dump', () async {
    final schema = await verifier.schemaAt(2);
    final db = CacheDatabase(schema.newConnection());
    await verifier.migrateAndValidate(db, 2);
    await db.close();
  });
}
