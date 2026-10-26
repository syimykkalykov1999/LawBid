import 'package:drift/drift.dart';
import 'package:flutter/foundation.dart' show debugPrint;

/// S15-9: rows trimmed from a cache leave free pages in the SQLite file; the
/// file keeps its high-water mark ("LawBid 3 GB" after a year although the
/// limit says 500 MB). These two statements hand the pages back.
extension StorageCompaction on GeneratedDatabase {
  /// Returns freed pages to the OS (effective on files created with
  /// `auto_vacuum = INCREMENTAL`, see `drift_web.dart`; a harmless no-op on
  /// older files). Never throws.
  Future<void> incrementalVacuum() async {
    try {
      await customStatement('PRAGMA incremental_vacuum;');
    } on Object catch (e) {
      debugPrint('incremental_vacuum: $e');
    }
  }

  /// Folds the write-ahead log back into the database and shrinks it to
  /// zero (a WAL that was never checkpointed grows without bound). Never
  /// throws.
  Future<void> checkpointWal() async {
    try {
      await customStatement('PRAGMA wal_checkpoint(TRUNCATE);');
    } on Object catch (e) {
      debugPrint('wal_checkpoint: $e');
    }
  }
}
