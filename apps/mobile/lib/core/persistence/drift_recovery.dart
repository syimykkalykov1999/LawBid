import 'dart:async';
import 'dart:io';

import 'package:drift/drift.dart';
import 'package:flutter/foundation.dart' show debugPrint;

/// What to do with a local database file that cannot be opened (a failed
/// migration, a corrupt file, a full disk, a write killed half way).
enum DriftRecovery {
  /// A pure cache (HTTP answers, translations, case lists): delete the file
  /// and start again; everything refills from the server.
  rebuildCache,

  /// Holds work the user has not sent yet (the chat outbox, the upload
  /// queue, a case draft): never deleted. The file is moved aside as
  /// `<name>.sqlite.corrupt-<time>`, the app starts with an empty database
  /// and the failure is reported, so nothing is lost without a trace.
  quarantine,
}

/// Reports a recovery (Sentry, via `SentryReporter`). Never throws.
typedef DriftRecoveryReporter = void Function(
  String database,
  Object error,
  StackTrace stack, {
  required DriftRecovery recovery,
});

/// S15-5: the app's local SQLite files used to have no way out of a bad
/// open: every read of that database threw for good and only a reinstall
/// helped. This wraps the real executor; when `ensureOpen` fails (which
/// includes the migration, as drift runs it there) it
///
/// 1. reports the failure,
/// 2. clears the files per [DriftRecovery],
/// 3. opens a new executor and tries once more,
/// 4. and as the last resort works in memory for this process.
///
/// One recovery per process: a second failure is rethrown like before.
class RecoveringExecutor extends QueryExecutor {
  RecoveringExecutor({
    required this.name,
    required this.recovery,
    required QueryExecutor Function() open,
    required Future<List<File>> Function() files,
    Future<QueryExecutor?> Function()? memory,
    DriftRecoveryReporter? report,
    DateTime Function()? now,
  })  : _open = open,
        _files = files,
        _memory = memory,
        _report = report,
        _now = now ?? DateTime.now,
        _current = open();

  final String name;
  final DriftRecovery recovery;
  final QueryExecutor Function() _open;
  final Future<List<File>> Function() _files;
  final Future<QueryExecutor?> Function()? _memory;
  final DriftRecoveryReporter? _report;
  final DateTime Function() _now;

  QueryExecutor _current;
  bool _recovered = false;
  Future<bool>? _recovering;

  /// Whether a recovery ran in this process (tests, diagnostics).
  bool get didRecover => _recovered;

  @override
  SqlDialect get dialect => SqlDialect.sqlite;

  @override
  Future<bool> ensureOpen(QueryExecutorUser user) async {
    try {
      return await _current.ensureOpen(user);
    } on Object catch (e, st) {
      if (_recovered) {
        // Another call that failed on the old executor while a recovery ran.
        final running = _recovering;
        if (running != null) {
          await running;
          return _current.ensureOpen(user);
        }
        rethrow;
      }
      _recovered = true;
      final done = _recovering = _recover(user, e, st);
      try {
        return await done;
      } finally {
        _recovering = null;
      }
    }
  }

  Future<bool> _recover(
    QueryExecutorUser user,
    Object error,
    StackTrace stack,
  ) async {
    try {
      _report?.call(name, error, stack, recovery: recovery);
    } on Object {
      // Reporting must never be the next failure.
    }
    final failed = _current;
    try {
      await failed.close();
    } on Object {
      // Already broken; the files go next.
    }
    try {
      await _clearFiles();
    } on Object catch (e) {
      debugPrint('local database "$name": could not clear files: $e');
    }
    _current = _open();
    try {
      return await _current.ensureOpen(user);
    } on Object catch (e) {
      final memory = await _memory?.call();
      if (memory == null) rethrow;
      debugPrint('local database "$name" stays in memory this run: $e');
      _current = memory;
      return memory.ensureOpen(user);
    }
  }

  Future<void> _clearFiles() async {
    final files = await _files();
    final stamp = _now().millisecondsSinceEpoch ~/ 1000;
    for (var i = 0; i < files.length; i++) {
      final file = files[i];
      if (!file.existsSync()) continue;
      // files[0] is the database itself; the rest are its -wal / -shm /
      // -journal companions, useless without it.
      if (i == 0 && recovery == DriftRecovery.quarantine) {
        _dropOldQuarantine(file);
        file.renameSync('${file.path}.corrupt-$stamp');
      } else {
        file.deleteSync();
      }
    }
  }

  /// Keeps one quarantined copy per database, not a pile of them.
  void _dropOldQuarantine(File db) {
    final dir = db.parent;
    final base = db.uri.pathSegments.last;
    for (final entity in dir.listSync()) {
      final seg = entity.uri.pathSegments.where((s) => s.isNotEmpty).last;
      if (entity is File && seg.startsWith('$base.corrupt-')) {
        entity.deleteSync();
      }
    }
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
