import 'dart:async' show TimeoutException;
import 'dart:io' show File, Platform;

import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:lawbid/core/diagnostics/sentry_reporter.dart';
import 'package:lawbid/core/persistence/drift_memory_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/persistence/drift_memory_web.dart';
import 'package:lawbid/core/persistence/drift_recovery.dart';
import 'package:lawbid/core/platform/base_uri.dart';
import 'package:path_provider/path_provider.dart';
import 'package:sqlite3/common.dart' show CommonDatabase;

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

/// S15-9: `auto_vacuum = INCREMENTAL` on every NEW database file (it only
/// takes effect before the first table exists), so pages freed by a cache
/// trim can be handed back to the OS (`PRAGMA incremental_vacuum`, run after
/// the cache limits are enforced) instead of the file keeping its
/// high-water mark. Runs in the database isolate: top-level on purpose.
void _setupPragmas(CommonDatabase db) {
  db.execute('PRAGMA auto_vacuum = INCREMENTAL;');
}

const _nativeOptions = DriftNativeOptions(setup: _setupPragmas);

/// The files of a phone database: the database, then its companions.
Future<List<File>> _databaseFiles(String name) async {
  final dir = (await getApplicationDocumentsDirectory()).path;
  final base = '$dir${Platform.pathSeparator}$name.sqlite';
  return [
    File(base),
    File('$base-wal'),
    File('$base-shm'),
    File('$base-journal'),
  ];
}

void _reportRecovery(
  String database,
  Object error,
  StackTrace stack, {
  required DriftRecovery recovery,
}) {
  // Nothing personal: the database name, what was done and the error type
  // (the reporter scrubs the message again).
  SentryReporter.capture(
    StateError(
      'local database "$database" could not be opened '
      '(${error.runtimeType}); ${recovery.name}',
    ),
    stack,
  );
}

QueryExecutor _nativeDatabase(String name, DriftRecovery recovery) =>
    RecoveringExecutor(
      name: name,
      recovery: recovery,
      open: () => driftDatabase(
        name: name,
        web: appDriftWebOptions,
        native: _nativeOptions,
      ),
      files: () => _databaseFiles(name),
      memory: () => openProcessMemoryDatabase(appDriftWebOptions.sqlite3Wasm),
      report: _reportRecovery,
    );

/// The app's local database [name]. [recovery] says what happens when the
/// file cannot be opened (see [DriftRecovery]): a cache is rebuilt, a
/// database that holds unsent work is moved aside and started empty. On the
/// web, when the browser's storage can't be opened (a private window,
/// blocked site data, a browser whose worker can't load SQLite) the app keeps
/// working on a database that lives only in the tab instead of staying on a
/// blank screen: the caches start empty and refill from the server.
QueryExecutor appDriftDatabase(
  String name, {
  DriftRecovery recovery = DriftRecovery.rebuildCache,
}) {
  if (kIsWeb) {
    return _FallbackExecutor(
      driftDatabase(name: name, web: appDriftWebOptions),
      openMemoryDatabase,
    );
  }
  // Owner 2026-10-22: under `flutter test` there is no documents directory
  // (and a platform call never answers), so a database nobody overrode
  // lives in the test's memory instead of holding the screen.
  if (isFlutterTest) {
    return LazyDatabase(() async {
      final memory = await openProcessMemoryDatabase(
        appDriftWebOptions.sqlite3Wasm,
      );
      return memory ?? driftDatabase(name: name, web: appDriftWebOptions);
    });
  }
  return _nativeDatabase(name, recovery);
}

/// True under `flutter test` (never on the web).
bool get isFlutterTest =>
    !kIsWeb && Platform.environment.containsKey('FLUTTER_TEST');

/// Owner 2026-10-22 (client economy plan §5): a cache database. On the web
/// it lives only in the tab's memory (a shared or private computer keeps
/// nothing of the account on disk); on phones it is a file; when that file
/// cannot be opened or migrated (S15-5) it is deleted and created again, and
/// should that fail too (no documents directory, a full disk) the cache works
/// in memory for this process.
QueryExecutor appDriftCacheDatabase(String name) {
  if (!kIsWeb) return appDriftDatabase(name);
  return LazyDatabase(() async {
    final memory = await openProcessMemoryDatabase(
      appDriftWebOptions.sqlite3Wasm,
    );
    return memory ?? appDriftDatabase(name);
  });
}

class _FallbackExecutor extends QueryExecutor {
  _FallbackExecutor(this._current, this._fallback);

  /// How long the persistent database may take to open (its files come
  /// over the network: drift_worker.js 350 KB, sqlite3.wasm 750 KB).
  static const openTimeout = Duration(seconds: 12);

  QueryExecutor _current;
  final Future<QueryExecutor?> Function(Uri sqlite3Wasm) _fallback;
  bool _fellBack = false;

  @override
  SqlDialect get dialect => SqlDialect.sqlite;

  @override
  Future<bool> ensureOpen(QueryExecutorUser user) async {
    try {
      // Owner 2026-10-24 (slow-link pass): a worker that never answers
      // (blocked storage, a half-loaded sqlite3.wasm on a bad connection)
      // used to hold every screen that reads the database. After
      // [openTimeout] the tab's own in-memory database takes over, like
      // after an error.
      return await _current.ensureOpen(user).timeout(
            openTimeout,
            onTimeout: () => throw TimeoutException(
              'local storage did not open in $openTimeout',
            ),
          );
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
