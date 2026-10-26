import 'package:drift/drift.dart';
import 'package:drift/native.dart';

/// Phones never need the in-memory stand-in: their database is a file.
Future<QueryExecutor?> openMemoryDatabase(Uri sqlite3Wasm) async => null;

/// Owner 2026-10-22 (client economy plan §5): a database that lives only in
/// this process — the cache's stand-in when the file cannot be opened
/// (and in widget tests, where there is no documents directory).
Future<QueryExecutor?> openProcessMemoryDatabase(Uri sqlite3Wasm) async =>
    NativeDatabase.memory();
