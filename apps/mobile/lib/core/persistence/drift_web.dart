import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:lawbid/core/persistence/drift_memory_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/persistence/drift_memory_web.dart';
import 'package:lawbid/core/platform/base_uri.dart';
import 'package:path_provider/path_provider.dart';

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
  return kIsWeb ? _FallbackExecutor(stored, openMemoryDatabase) : stored;
}

/// Owner 2026-10-22 (client economy plan §5): a cache database. On the web
/// it lives only in the tab's memory (a shared or private computer keeps
/// nothing of the account on disk); on phones it is a file, and when that
/// file cannot be opened (or there is no documents directory, as in widget
/// tests) the cache works in memory for this process.
QueryExecutor appDriftCacheDatabase(String name) {
  if (kIsWeb) {
    return LazyDatabase(() async {
      final memory =
          await openProcessMemoryDatabase(appDriftWebOptions.sqlite3Wasm);
      return memory ?? appDriftDatabase(name);
    });
  }
  // drift_flutter starts opening the file as soon as it is built and
  // reports a failure as an unhandled error, so the directories are
  // checked first (a widget test has none).
  return LazyDatabase(() async {
    try {
      await getApplicationDocumentsDirectory();
      await getTemporaryDirectory();
    } on Object catch (e) {
      final memory =
          await openProcessMemoryDatabase(appDriftWebOptions.sqlite3Wasm);
      if (memory == null) rethrow;
      _FallbackExecutor.debugPrintFallback(e);
      return memory;
    }
    return driftDatabase(name: name, web: appDriftWebOptions);
  });
}

class _FallbackExecutor extends QueryExecutor {
  _FallbackExecutor(this._current, this._fallback);

  QueryExecutor _current;
  final Future<QueryExecutor?> Function(Uri sqlite3Wasm) _fallback;
  bool _fellBack = false;

  @override
  SqlDialect get dialect => SqlDialect.sqlite;

  @override
  Future<bool> ensureOpen(QueryExecutorUser user) async {
    try {
      return await _current.ensureOpen(user);
    } on Object catch (e) {
      if (_fellBack) rethrow;
      final memory = await _fallback(appDriftWebOptions.sqlite3Wasm);
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
    print('Local storage unavailable, using an in-memory database: $e');
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
