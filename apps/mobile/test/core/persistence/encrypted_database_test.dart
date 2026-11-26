import 'dart:io';

import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/persistence/drift_recovery.dart';
import 'package:lawbid/core/persistence/drift_web.dart' show cacheDatabaseSetup;
import 'package:lawbid/core/persistence/encrypted_database.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:sqlite3/sqlite3.dart';

/// S13 #26: the account's local databases are encrypted on the phone
/// (SQLite3MultipleCiphers through the sqlite3 build hook, drift
/// «Encryption»), and the old plaintext file is moved over once, safely.
void main() {
  late Directory dir;
  late String plain;
  late String encrypted;
  const key = 'test-local-db-key-1';

  setUp(() {
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
    dir = Directory.systemTemp.createTempSync('lawbid_encrypted_db');
    plain = '${dir.path}/lawbid_social.sqlite';
    encrypted = encryptedPathOf(plain);
    addTearDown(() => dir.deleteSync(recursive: true));
  });

  /// A plaintext database like the one the app kept before S13.
  void writePlain(List<String> bodies, {bool wal = false}) {
    final db = sqlite3.open(plain);
    if (wal) db.execute('PRAGMA journal_mode = WAL;');
    db.execute('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)');
    for (final b in bodies) {
      db.execute('INSERT INTO notes (body) VALUES (?)', [b]);
    }
    db.close();
  }

  List<String> readEncrypted(String withKey) {
    final db = sqlite3.open(encrypted);
    try {
      applyDatabaseKey(db, withKey);
      return [
        for (final r in db.select('SELECT body FROM notes ORDER BY id'))
          r['body'] as String,
      ];
    } finally {
      db.close();
    }
  }

  bool looksPlain(String path) {
    final head = File(path).openSync()..setPositionSync(0);
    final bytes = head.readSync(16);
    head.closeSync();
    return String.fromCharCodes(bytes).startsWith('SQLite format 3');
  }

  test('the linked SQLite is SQLite3MultipleCiphers (drift docs check)', () {
    final db = sqlite3.openInMemory();
    addTearDown(db.close);
    expect(hasCipher(db), isTrue);
  });

  test('a plaintext file is encrypted, its data kept, the plaintext deleted',
      () {
    writePlain(['привет', 'second']);
    expect(looksPlain(plain), isTrue);

    final done = migrateToEncrypted(
      plainPath: plain,
      encryptedPath: encrypted,
      key: key,
    );

    expect(done, EncryptionMigration.migrated);
    expect(File(plain).existsSync(), isFalse);
    expect(File('$encrypted.tmp').existsSync(), isFalse);
    expect(looksPlain(encrypted), isFalse);
    // The text is nowhere in the file.
    final raw = File(encrypted).readAsBytesSync();
    expect(String.fromCharCodes(raw).contains('second'), isFalse);
    expect(readEncrypted(key), ['привет', 'second']);
    // Done once: the next start has nothing to do.
    expect(
      migrateToEncrypted(plainPath: plain, encryptedPath: encrypted, key: key),
      EncryptionMigration.none,
    );
  });

  test('a WAL plaintext file (the caches) moves over with its WAL', () {
    // A connection still open keeps the rows in the -wal file only.
    final open = sqlite3.open(plain)
      ..execute('PRAGMA journal_mode = WAL;')
      ..execute('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)')
      ..execute("INSERT INTO notes (body) VALUES ('in the wal')");
    final copyDir = Directory('${dir.path}/crashed')..createSync();
    for (final s in ['', '-wal', '-shm']) {
      final f = File('$plain$s');
      if (f.existsSync()) f.copySync('${copyDir.path}/lawbid_social.sqlite$s');
    }
    open.close();
    // The copy is the state a killed app leaves: database + its -wal.
    plain = '${copyDir.path}/lawbid_social.sqlite';
    encrypted = encryptedPathOf(plain);
    expect(File('$plain-wal').existsSync(), isTrue);

    migrateToEncrypted(plainPath: plain, encryptedPath: encrypted, key: key);

    expect(readEncrypted(key), ['in the wal']);
    expect(File('$plain-wal').existsSync(), isFalse);
    expect(File('$plain-shm').existsSync(), isFalse);
  });

  test('stopped before the rename (half a .tmp): the next start starts over',
      () {
    writePlain(['kept']);
    File('$encrypted.tmp').writeAsBytesSync(List.filled(1500, 9));

    final done = migrateToEncrypted(
      plainPath: plain,
      encryptedPath: encrypted,
      key: key,
    );

    expect(done, EncryptionMigration.migrated);
    expect(readEncrypted(key), ['kept']);
    expect(File('$encrypted.tmp').existsSync(), isFalse);
  });

  test('stopped after the rename: the next start only drops the plaintext', () {
    writePlain(['kept']);
    final backup = File(plain).readAsBytesSync();
    migrateToEncrypted(plainPath: plain, encryptedPath: encrypted, key: key);
    // As if the app was killed between the rename and the delete.
    File(plain).writeAsBytesSync(backup);

    final done = migrateToEncrypted(
      plainPath: plain,
      encryptedPath: encrypted,
      key: key,
    );

    expect(done, EncryptionMigration.finished);
    expect(File(plain).existsSync(), isFalse);
    expect(readEncrypted(key), ['kept']);
  });

  test('a wrong key does not open the file', () {
    writePlain(['secret']);
    migrateToEncrypted(plainPath: plain, encryptedPath: encrypted, key: key);

    expect(() => readEncrypted('another-key'), throwsA(isA<SqliteException>()));
    // And without any key it is not a database either.
    final bare = sqlite3.open(encrypted);
    addTearDown(bare.close);
    expect(
      () => bare.select('SELECT count(*) FROM sqlite_master'),
      throwsA(isA<SqliteException>()),
    );
  });

  test('a damaged plaintext file is reported as corrupt (usual recovery)',
      () async {
    File(plain).writeAsBytesSync(List.filled(4096, 7));
    await expectLater(
      migrateInBackground(plainPath: plain, encryptedPath: encrypted, key: key),
      throwsA(isA<PlaintextDatabaseCorrupt>()),
    );
    expect(File(encrypted).existsSync(), isFalse);
  });

  group('through drift (the app opener)', () {
    Future<SocialLocalDatabase> openApp(String withKey) async =>
        SocialLocalDatabase(
          openEncryptedDatabase(
            name: 'lawbid_social',
            plainPath: () async => plain,
            key: () async => withKey,
            setup: (_) {},
            tempDirectory: () async => dir.path,
          ),
        );

    test('the old outbox comes back after the move; nothing is lost', () async {
      final old = SocialLocalDatabase(NativeDatabase(File(plain)));
      await old.enqueue(
        clientMessageId: 'c1',
        ownerId: 'u1',
        conversationId: 'conv',
        body: 'unsent message',
      );
      await old.close();

      final db = await openApp(key);
      final rows = await db.pending('u1');
      await db.close();

      expect(rows.single.body, 'unsent message');
      expect(File(plain).existsSync(), isFalse);
      expect(looksPlain(encrypted), isFalse);

      // Opened again (the next start): the same rows, no second move.
      final again = await openApp(key);
      expect((await again.pending('u1')).single.clientMessageId, 'c1');
      await again.close();
    });

    test('the wrong key fails the open (the recovery takes it from there)',
        () async {
      final first = await openApp(key);
      await first.enqueue(
        clientMessageId: 'c1',
        ownerId: 'u1',
        conversationId: 'conv',
        body: 'x',
      );
      await first.close();

      final wrong = await openApp('another-key');
      await expectLater(wrong.pending('u1'), throwsA(anything));
      await wrong.close();
    });

    test('the E2EE plaintext store (CacheDatabase, WAL) works encrypted',
        () async {
      plain = '${dir.path}/lawbid_cache.sqlite';
      encrypted = encryptedPathOf(plain);
      CacheDatabase open() => CacheDatabase(
            openEncryptedDatabase(
              name: 'lawbid_cache',
              plainPath: () async => plain,
              key: () async => key,
              setup: cacheDatabaseSetup,
              tempDirectory: () async => dir.path,
            ),
          );
      final cache = open();
      await cache.putE2eePlaintext(
        E2eePlaintextsCompanion.insert(
          owner: 'u1',
          id: 'm1',
          conversationId: 'c1',
          payload: '{"text":"секрет"}',
          createdAt: DateTime.utc(2026, 11, 26),
        ),
      );
      final mode = await cache
          .customSelect('PRAGMA journal_mode')
          .map((r) => r.data.values.first)
          .getSingle();
      expect(mode, 'wal');
      await cache.close();

      final again = open();
      expect(
        (await again.e2eePlaintext('u1', 'm1'))?.payload,
        '{"text":"секрет"}',
      );
      await again.close();
      expect(looksPlain(encrypted), isFalse);
      expect(
        String.fromCharCodes(File(encrypted).readAsBytesSync())
            .contains('text'),
        isFalse,
      );
    });

    test('a key that cannot be read keeps every file and works in memory',
        () async {
      writePlain(['kept']);
      final reports = <String>[];
      final executor = RecoveringExecutor(
        name: 'lawbid_social',
        recovery: DriftRecovery.quarantine,
        open: () => openEncryptedDatabase(
          name: 'lawbid_social',
          plainPath: () async => plain,
          key: () async => throw const _Locked(),
          setup: (_) {},
          tempDirectory: () async => dir.path,
        ),
        files: () async => [File(encrypted), File(plain)],
        memory: () async => NativeDatabase.memory(),
        report: (db, e, st, {required recovery}) => reports.add(db),
      );
      final db = SocialLocalDatabase(executor);
      expect(await db.pending('u1'), isEmpty);
      await db.close();

      expect(reports, ['lawbid_social']);
      expect(File(plain).existsSync(), isTrue, reason: 'the plaintext stays');
      expect(
        dir.listSync().where((e) => e.path.contains('corrupt')),
        isEmpty,
      );
    });
  });
}

class _Locked implements DatabaseFilesKept {
  const _Locked();
}
