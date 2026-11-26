import 'dart:io';
import 'dart:isolate';

import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';
import 'package:lawbid/core/persistence/drift_recovery.dart';
import 'package:sqlite3/common.dart' show CommonDatabase;
import 'package:sqlite3/sqlite3.dart';

/// S13 #26 (MASVS-STORAGE-1): the local databases that hold the account's
/// data (cached chats and answers with the E2EE plaintext store, the social
/// store with the chat outbox, case drafts, the upload queue) are encrypted
/// on the phone, with drift's documented setup (drift «Encryption», 2.32+):
/// the `sqlite3` package's build hook links SQLite3MultipleCiphers instead of
/// SQLite (`hooks: user_defines: sqlite3: source: sqlite3mc` in
/// pubspec.yaml), the key is set with `PRAGMA key` in `setup` before drift
/// touches the file, and an existing plaintext file is moved over once with
/// the docs' `VACUUM INTO` + `PRAGMA rekey` + rename. The web keeps OPFS
/// (cleared on sign-out) and is not touched.
const encryptedDatabases = {
  'lawbid_cache',
  'lawbid_social',
  'lawbid_cases',
  'lawbid_uploads',
};

/// The encrypted file next to the old `<name>.sqlite`.
String encryptedPathOf(String plainPath) => plainPath.endsWith('.sqlite')
    ? '${plainPath.substring(0, plainPath.length - 7)}.enc.sqlite'
    : '$plainPath.enc';

/// drift docs: single quotes doubled inside an SQL string literal.
String _escape(String source) => source.replaceAll("'", "''");

/// drift docs («Important notice»): upstream SQLite has no `cipher` pragma,
/// SQLite3MultipleCiphers has.
bool hasCipher(CommonDatabase database) =>
    database.select('PRAGMA cipher;').isNotEmpty;

/// Sets [key] on a just-opened connection. Throws when the library has no
/// encryption (never writes the user's data to a plain file under the
/// encrypted name) and when the key does not open the file: the first page
/// is read here, so a wrong key fails the open, not some later query.
void applyDatabaseKey(CommonDatabase database, String key) {
  if (!hasCipher(database)) {
    throw StateError(
      'SQLite3MultipleCiphers is not linked '
      '(pubspec.yaml hooks.user_defines.sqlite3.source)',
    );
  }
  database
    ..execute("PRAGMA key = '${_escape(key)}';")
    ..select('SELECT count(*) FROM sqlite_master;');
}

/// What [migrateToEncrypted] found.
enum EncryptionMigration {
  /// Nothing to move (a new install, or done earlier).
  none,

  /// The plaintext file was copied, encrypted and deleted now.
  migrated,

  /// An earlier run stopped after the encrypted file was complete; the
  /// plaintext leftovers are deleted now.
  finished,
}

const _companions = ['-wal', '-shm', '-journal'];

void _deleteIfThere(File file) {
  if (file.existsSync()) file.deleteSync();
}

/// The one-time move of [plainPath] into the encrypted [encryptedPath]
/// (drift docs, «Encrypting existing databases»), safe to stop at any point:
///
/// * the plaintext file is only read until the encrypted copy is complete;
/// * the copy is made and encrypted under `<encrypted>.tmp`, and the rename
///   to [encryptedPath] is the commit point (atomic on one file system);
/// * a run that stopped before the rename leaves a `.tmp` that the next run
///   deletes and starts over from the untouched plaintext;
/// * a run that stopped after the rename leaves plaintext leftovers that the
///   next run deletes ([EncryptionMigration.finished]).
///
/// Synchronous on purpose: it runs in a background isolate
/// ([migrateInBackground]), never on the UI thread.
EncryptionMigration migrateToEncrypted({
  required String plainPath,
  required String encryptedPath,
  required String key,
}) {
  final plain = File(plainPath);
  final encrypted = File(encryptedPath);
  final tmp = File('$encryptedPath.tmp');
  final plainFiles = [plain, for (final s in _companions) File('$plainPath$s')];
  final tmpFiles = [tmp, for (final s in _companions) File('${tmp.path}$s')];

  if (encrypted.existsSync()) {
    final leftovers = [...plainFiles, ...tmpFiles].where((f) => f.existsSync());
    if (leftovers.isEmpty) return EncryptionMigration.none;
    leftovers.toList().forEach(_deleteIfThere);
    return EncryptionMigration.finished;
  }
  tmpFiles.forEach(_deleteIfThere);
  if (!plain.existsSync()) return EncryptionMigration.none;

  final source = sqlite3.open(plainPath);
  try {
    source.execute("VACUUM INTO '${_escape(tmp.path)}';");
  } finally {
    source.close();
  }
  final target = sqlite3.open(tmp.path);
  try {
    if (!hasCipher(target)) {
      throw StateError('SQLite3MultipleCiphers is not linked');
    }
    // `rekey` works on a rollback-journal database only (SQLite3MultipleCiphers
    // «PRAGMA rekey»); the WAL caches are switched back by their setup.
    target
      ..execute('PRAGMA journal_mode = DELETE;')
      ..execute("PRAGMA rekey = '${_escape(key)}';");
  } finally {
    target.close();
  }
  // The copy must open with the key and be whole before the plaintext goes.
  final check = sqlite3.open(tmp.path);
  try {
    applyDatabaseKey(check, key);
    final result = check.select('PRAGMA quick_check;');
    if (result.isEmpty || result.first.values.first != 'ok') {
      throw StateError('the encrypted copy failed quick_check');
    }
  } finally {
    check.close();
  }
  tmp.renameSync(encryptedPath);
  plainFiles.forEach(_deleteIfThere);
  return EncryptionMigration.migrated;
}

/// The migration could not finish now (a full disk, an I/O error). Nothing
/// was deleted: the plaintext file stays, the database works in memory for
/// this process and the next start tries again.
class EncryptionMigrationPending implements DatabaseFilesKept {
  const EncryptionMigrationPending(this.reason);

  final String reason;

  @override
  String toString() => 'EncryptionMigrationPending($reason)';
}

/// The plaintext file is damaged (SQLite says corrupt / not a database): the
/// usual recovery of the database applies to it (a cache is rebuilt, a queue
/// is moved aside).
class PlaintextDatabaseCorrupt implements Exception {
  const PlaintextDatabaseCorrupt(this.reason);

  final String reason;

  @override
  String toString() => 'PlaintextDatabaseCorrupt($reason)';
}

/// [migrateToEncrypted] in a background isolate.
Future<EncryptionMigration> migrateInBackground({
  required String plainPath,
  required String encryptedPath,
  required String key,
  String? tempDirectory,
}) async {
  final (int code, String detail) = await Isolate.run(() {
    try {
      if (tempDirectory != null) sqlite3.tempDirectory = tempDirectory;
      final done = migrateToEncrypted(
        plainPath: plainPath,
        encryptedPath: encryptedPath,
        key: key,
      );
      return (0, done.name);
    } on SqliteException catch (e) {
      // SQLITE_CORRUPT (11) / SQLITE_NOTADB (26): the file itself is bad.
      final corrupt = e.resultCode == 11 || e.resultCode == 26;
      return (corrupt ? 1 : 2, 'sqlite ${e.extendedResultCode}');
    } on Object catch (e) {
      return (2, e.runtimeType.toString());
    }
  });
  return switch (code) {
    0 => EncryptionMigration.values.byName(detail),
    1 => throw PlaintextDatabaseCorrupt(detail),
    _ => throw EncryptionMigrationPending(detail),
  };
}

/// The `setup` of an encrypted connection: the key first (it must be the
/// first statement), then the database's usual pragmas. Captures only the
/// key and [then], which are sent to drift's database isolate.
void Function(CommonDatabase) encryptedSetup(
  String key,
  void Function(CommonDatabase) then,
) =>
    (db) {
      applyDatabaseKey(db, key);
      then(db);
    };

/// Opens the encrypted database whose plaintext predecessor is
/// [plainPath]: reads the key, finishes or runs the migration, then opens
/// the encrypted file with drift_flutter's opener.
QueryExecutor openEncryptedDatabase({
  required String name,
  required Future<String> Function() plainPath,
  required Future<String> Function() key,
  required void Function(CommonDatabase) setup,
  Future<String?> Function()? tempDirectory,
  DriftWebOptions? web,
}) =>
    // A LazyDatabase, not DatabaseConnection.delayed: a key that cannot be
    // read must surface once, from ensureOpen (where the recovery takes it),
    // not also as unhandled errors of the delayed connection's side futures.
    LazyDatabase(() async {
      final passphrase = await key();
      final plain = await plainPath();
      final encrypted = encryptedPathOf(plain);
      final temp = await tempDirectory?.call();
      await migrateInBackground(
        plainPath: plain,
        encryptedPath: encrypted,
        key: passphrase,
        tempDirectory: temp,
      );
      return driftDatabase(
        name: name,
        web: web,
        native: DriftNativeOptions(
          databasePath: () async => encrypted,
          tempDirectoryPath: tempDirectory,
          setup: encryptedSetup(passphrase, setup),
        ),
      );
    });
