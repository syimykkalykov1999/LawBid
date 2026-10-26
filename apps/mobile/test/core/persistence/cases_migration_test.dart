import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift_dev/api/migrations_native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/cases/data/cases_local_database.dart';

import 'generated_migrations/cases/schema.dart';

/// S15-5: the cases database (case drafts, seen bids)
/// against its checked-in schema dumps
/// (`drift_schemas/cases/`, made by `dart run drift_dev schema dump`).
/// Still v1: this guards the tables against drifting from the dump.
void main() {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
  late SchemaVerifier verifier;

  setUpAll(() => verifier = SchemaVerifier(GeneratedHelper()));

  test('the current schema (v1) matches its dump', () async {
    final schema = await verifier.schemaAt(1);
    final db = CasesLocalDatabase(schema.newConnection());
    await verifier.migrateAndValidate(db, 1);
    await db.close();
  });
}
