import 'package:lawbid/core/platform/base_uri_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/platform/base_uri_web.dart'
    as impl;

/// Where the app's own files (`sqlite3.wasm`, the drift worker, …) live: the
/// page's `<base href>`. Not `Uri.base`, which is the address in the
/// browser's bar — on `/lawyer/anna` that would look for the files under
/// `/lawyer/` and get the page back.
Uri get appBaseUri => impl.baseUri();
