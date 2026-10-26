import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift_dev/api/migrations_native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/l10n_database.dart';

import 'generated_migrations/l10n/schema.dart';

/// S15-5: the l10n database (translations cache)
/// against its checked-in schema dumps
/// (`drift_schemas/l10n/`, made by `dart run drift_dev schema dump`).
/// Still v1: this guards the tables against drifting from the dump.
void main() {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
  late SchemaVerifier verifier;

  setUpAll(() => verifier = SchemaVerifier(GeneratedHelper()));

  test('the current schema (v1) matches its dump', () async {
    final schema = await verifier.schemaAt(1);
    final db = L10nDatabase(schema.newConnection());
    await verifier.migrateAndValidate(db, 1);
    await db.close();
  });
}
