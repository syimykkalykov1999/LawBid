import 'package:drift/drift.dart';

/// Phones never need the in-memory stand-in: their database is a file.
Future<QueryExecutor?> openMemoryDatabase(Uri sqlite3Wasm) async => null;
