import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:lawbid/core/persistence/drift_memory_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/persistence/drift_memory_web.dart';
import 'package:lawbid/core/platform/base_uri.dart';

/// Where the web build finds SQLite and drift's worker. Ignored on
/// Android/iOS. Both files live in `web/` (next to index.html) and are
/// versioned with pubspec.lock's drift and sqlite3 (see web/README.md).
///
/// Absolute (resolved against the page's `<base href>`, not the address
/// in the bar: a link such as /lawyer/anna must find the same files): drift hands these to a
/// shared worker, which cannot be trusted to resolve a relative path the
/// same way the page does.
final appDriftWebOptions = DriftWebOptions(
  sqlite3Wasm: appBaseUri.resolve('sqlite3.wasm'),
  driftWorker: appBaseUri.resolve('drift_worker.js'),
);

/// The app's local database [name]. On the web, when the browser's storage
/// can't be opened (a private window, blocked site data, a browser whose
/// worker can't load SQLite) the app keeps working on a database that lives
/// only in the tab instead of staying on a blank screen: the caches start
/// empty and refill from the server.
QueryExecutor appDriftDatabase(String name) {
  final stored = driftDatabase(name: name, web: appDriftWebOptions);
  return kIsWeb ? _WebFallbackExecutor(stored) : stored;
}

class _WebFallbackExecutor extends QueryExecutor {
  _WebFallbackExecutor(this._current);

  QueryExecutor _current;
  bool _fellBack = false;

  @override
  SqlDialect get dialect => SqlDialect.sqlite;

  @override
  Future<bool> ensureOpen(QueryExecutorUser user) async {
    try {
      return await _current.ensureOpen(user);
    } on Object catch (e) {
      if (_fellBack) rethrow;
      final memory = await openMemoryDatabase(appDriftWebOptions.sqlite3Wasm);
      if (memory == null) rethrow;
      debugPrintFallback(e);
      _fellBack = true;
      final failed = _current;
      _current = memory;
      failed.close().ignore();
      return memory.ensureOpen(user);
    }
  }

  static void debugPrintFallback(Object e) {
    // ignore: avoid_print
    print('Local storage unavailable, using an in-tab database: $e');
  }

  @override
  QueryExecutor beginExclusive() => _current.beginExclusive();

  @override
  TransactionExecutor beginTransaction() => _current.beginTransaction();

  @override
  Future<void> runBatched(BatchedStatements statements) =>
      _current.runBatched(statements);

  @override
  Future<void> runCustom(String statement, [List<Object?>? args]) =>
      _current.runCustom(statement, args);

  @override
  Future<int> runDelete(String statement, List<Object?> args) =>
      _current.runDelete(statement, args);

  @override
  Future<int> runInsert(String statement, List<Object?> args) =>
      _current.runInsert(statement, args);

  @override
  Future<List<Map<String, Object?>>> runSelect(
    String statement,
    List<Object?> args,
  ) =>
      _current.runSelect(statement, args);

  @override
  Future<int> runUpdate(String statement, List<Object?> args) =>
      _current.runUpdate(statement, args);

  @override
  Future<void> close() => _current.close();
}
