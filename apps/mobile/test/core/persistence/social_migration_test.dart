import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift_dev/api/migrations_native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';

import 'generated_migrations/social/schema.dart';

/// S15-5: the social database (cached pages, the unsent chat outbox, recent
/// searches)
/// against its checked-in schema dumps
/// (`drift_schemas/social/`, made by `dart run drift_dev schema dump`).
/// The outbox holds messages not sent yet: its upgrade must be exact.
void main() {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
  late SchemaVerifier verifier;

  setUpAll(() => verifier = SchemaVerifier(GeneratedHelper()));

  for (final from in [1]) {
    test('upgrade from v$from to v2 keeps the schema exact', () async {
      final schema = await verifier.schemaAt(from);
      final db = SocialLocalDatabase(schema.newConnection());
      await verifier.migrateAndValidate(db, 2);
      await db.close();
    });
  }
  test('the current schema (v2) matches its dump', () async {
    final schema = await verifier.schemaAt(2);
    final db = SocialLocalDatabase(schema.newConnection());
    await verifier.migrateAndValidate(db, 2);
    await db.close();
  });
}
