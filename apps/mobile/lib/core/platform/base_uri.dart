import 'package:lawbid/core/platform/base_uri_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/platform/base_uri_web.dart'
    as impl;

/// Where the app's own files (`sqlite3.wasm`, the drift worker, …) live: the
/// page's `<base href>`. Not `Uri.base`, which is the address in the
/// browser's bar — on `/lawyer/anna` that would look for the files under
/// `/lawyer/` and get the page back.
Uri get appBaseUri => impl.baseUri();

/// Pack F (25.11, ROUND5 F8): where the database's worker and SQLite live.
/// The deploy keeps content-hash copies (`drift_worker.<hash>.js`,
/// `sqlite3.<hash>.wasm`, cached for a year) and boot_head.js names them;
/// a local build or an older page has only the plain names.
Uri get appDriftWorkerUri => impl.dbFileUri('drift_worker.js', 'worker');
Uri get appSqlite3WasmUri => impl.dbFileUri('sqlite3.wasm', 'sqlite');
