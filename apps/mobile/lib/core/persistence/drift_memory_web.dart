import 'package:drift/drift.dart';
import 'package:drift/wasm.dart';
import 'package:sqlite3/wasm.dart';

/// A database that lives only in this tab: SQLite loaded on the page itself,
/// no worker and no browser storage.
Future<QueryExecutor?> openMemoryDatabase(Uri sqlite3Wasm) async {
  final sqlite3 = await WasmSqlite3.loadFromUrl(sqlite3Wasm);
  sqlite3.registerVirtualFileSystem(InMemoryFileSystem(), makeDefault: true);
  return WasmDatabase.inMemory(sqlite3);
}
