import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';
import 'package:sqlite3/common.dart' show CommonDatabase;

/// The web build of `encrypted_database.dart` (which needs dart:ffi): the
/// web keeps its databases in the browser (OPFS, cleared on sign-out) and
/// never opens a phone file, so nothing here is reached there.
const encryptedDatabases = <String>{};

String encryptedPathOf(String plainPath) => '$plainPath.enc';

QueryExecutor openEncryptedDatabase({
  required String name,
  required Future<String> Function() plainPath,
  required Future<String> Function() key,
  required void Function(CommonDatabase) setup,
  Future<String?> Function()? tempDirectory,
  DriftWebOptions? web,
}) =>
    throw UnsupportedError('no encrypted phone database on the web');
