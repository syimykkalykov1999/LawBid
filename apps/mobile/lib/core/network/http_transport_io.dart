import 'dart:io';

import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:http/http.dart' as http;
import 'package:native_dio_adapter/native_dio_adapter.dart';

/// dart:io closes idle sockets after 15 s; ALB keeps them for 300 s.
const _idleTimeout = Duration(seconds: 90);
const _maxConnectionsPerHost = 6;

bool get _isMobile => Platform.isIOS || Platform.isAndroid;

void applyAdapter(Dio dio, {required bool native}) {
  if (native && _isMobile) {
    try {
      dio.httpClientAdapter = NativeAdapter(
        // Our own ETag cache (core/cache) already stores answers: no second
        // HTTP cache inside Cronet.
        createCronetEngine: () =>
            CronetEngine.build(cacheMode: CacheMode.disabled),
      );
      return;
    } catch (_) {
      // No Play Services / engine failure: fall through to dart:io.
    }
  }
  dio.httpClientAdapter = tunedIoAdapter();
}

/// The fallback and the `HTTP_NATIVE=off` client (S8-2).
IOHttpClientAdapter tunedIoAdapter() => IOHttpClientAdapter(
      createHttpClient: () => HttpClient()
        ..idleTimeout = _idleTimeout
        ..maxConnectionsPerHost = _maxConnectionsPerHost,
    );

http.Client? createNativeClient() {
  if (Platform.isIOS) {
    return CupertinoClient.defaultSessionConfiguration();
  }
  if (Platform.isAndroid) {
    return CronetClient.fromCronetEngine(
      CronetEngine.build(cacheMode: CacheMode.disabled),
      closeEngine: true,
    );
  }
  return null;
}
