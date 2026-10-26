import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/l10n_database.dart';
import 'package:lawbid/core/persistence/drift_recovery.dart';

/// S15-5: a local database file that cannot be opened must not break every
/// read for good.
void main() {
  late Directory dir;
  late File file;

  setUp(() {
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
    dir = Directory.systemTemp.createTempSync('lawbid_drift_recovery');
    file = File('${dir.path}/test.sqlite');
    addTearDown(() => dir.deleteSync(recursive: true));
  });

  RecoveringExecutor executor(
    DriftRecovery recovery, {
    List<String>? reports,
    bool memory = false,
    QueryExecutor Function()? open,
  }) =>
      RecoveringExecutor(
        name: 'test',
        recovery: recovery,
        open: open ?? () => NativeDatabase(file),
        files: () async =>
            [file, File('${file.path}-wal'), File('${file.path}-shm')],
        memory: memory ? () async => NativeDatabase.memory() : null,
        report: (db, e, st, {required recovery}) =>
            reports?.add('$db:${recovery.name}'),
        now: () => DateTime.utc(2026, 10, 25, 12),
      );

  void corrupt() => file.writeAsBytesSync(List.filled(4096, 7));

  test('a healthy file is opened as usual, nothing reported', () async {
    final reports = <String>[];
    final ex = executor(DriftRecovery.rebuildCache, reports: reports);
    final db = L10nDatabase(ex);
    addTearDown(db.close);
    expect(await db.loadLanguage('en'), isEmpty);
    expect(reports, isEmpty);
    expect(ex.didRecover, isFalse);
  });

  test('a corrupt cache is deleted and created again', () async {
    corrupt();
    final reports = <String>[];
    final ex = executor(DriftRecovery.rebuildCache, reports: reports);
    final db = L10nDatabase(ex);
    addTearDown(db.close);
    expect(await db.loadLanguage('en'), isEmpty);
    expect(reports, ['test:rebuildCache']);
    expect(ex.didRecover, isTrue);
    expect(
      dir.listSync().map((e) => e.path).where((p) => p.contains('corrupt')),
      isEmpty,
    );
    // And it is a working database now.
    await db.getVersion('en');
  });

  test('a corrupt queue is moved aside, not deleted', () async {
    corrupt();
    final reports = <String>[];
    final ex = executor(DriftRecovery.quarantine, reports: reports);
    final db = L10nDatabase(ex);
    addTearDown(db.close);
    expect(await db.loadLanguage('en'), isEmpty);
    expect(reports, ['test:quarantine']);
    final aside = dir
        .listSync()
        .map((e) => e.path)
        .where((p) => p.contains('.sqlite.corrupt-'))
        .toList();
    expect(aside, hasLength(1));
    expect(File(aside.single).readAsBytesSync(), List.filled(4096, 7));
  });

  test('when nothing can be opened the database lives in memory', () async {
    final ex = executor(
      DriftRecovery.rebuildCache,
      memory: true,
      // A directory is not a database file: every open fails.
      open: () => NativeDatabase(File(dir.path)),
    );
    final db = L10nDatabase(ex);
    addTearDown(db.close);
    expect(await db.loadLanguage('en'), isEmpty);
    expect(ex.didRecover, isTrue);
  });
}
