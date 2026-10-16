import 'package:drift_flutter/drift_flutter.dart';
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
