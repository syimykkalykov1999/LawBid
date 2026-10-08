import 'package:drift_flutter/drift_flutter.dart';

/// Where the web build finds SQLite and drift's worker. Ignored on
/// Android/iOS. Both files are copied next to index.html by
/// tool/web_preview/build.sh (the browser preview of the app).
final appDriftWebOptions = DriftWebOptions(
  sqlite3Wasm: Uri.parse('sqlite3.wasm'),
  driftWorker: Uri.parse('drift_worker.js'),
);
