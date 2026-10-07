import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

/// Opens a local Drift database by [name] on every platform. On the web it
/// runs SQLite as WebAssembly (IndexedDB/OPFS storage); `sqlite3.wasm` and
/// `drift_worker.js` are fetched next to `index.html` by
/// `tool/web_assets.sh` at build time, pinned to the versions in
/// pubspec.lock.
QueryExecutor openAppDatabase(String name) => driftDatabase(
      name: name,
      web: DriftWebOptions(
        sqlite3Wasm: Uri.parse('sqlite3.wasm'),
        driftWorker: Uri.parse('drift_worker.js'),
      ),
    );
