import 'package:lawbid/features/chat/e2ee/mls_engine.dart';

/// Neither dart:ffi nor dart:js_interop: no MLS client on this platform.
Future<MlsEngine> openMlsEngine(String userId) =>
    Future.error(UnsupportedError('MLS is not available on this platform'));
