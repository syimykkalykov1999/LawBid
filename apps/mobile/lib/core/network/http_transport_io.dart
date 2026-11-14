import 'dart:io';

import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:http/http.dart' as http;
import 'package:native_dio_adapter/native_dio_adapter.dart';

/// dart:io closes idle sockets after 15 s; ALB keeps them for 300 s.
const _idleTimeout = Duration(seconds: 90);
const _maxConnectionsPerHost = 6;

bool get _isMobile => Platform.isIOS || Platform.isAndroid;

/// D1-18 (13.11): ONE Cronet engine for the whole app on Android. Every
/// CronetEngine has its own network thread, DNS cache, HTTP/2 + QUIC
/// sessions and TLS session cache, so separate engines for the API, the
/// picture caches, HLS prefetch and downloads never reused each other's warm
/// connections to the same hosts. Built lazily on first use and never
/// closed: every client takes it with `closeEngine: false` (the
/// cronet_http / native_dio_adapter API as is). Our own ETag cache
/// (core/cache) already stores answers: no second HTTP cache inside Cronet.
CronetEngine? _sharedEngine;
CronetEngine _cronetEngine() =>
    _sharedEngine ??= CronetEngine.build(cacheMode: CacheMode.disabled);

void applyAdapter(Dio dio, {required bool native}) {
  if (native && _isMobile) {
    try {
      dio.httpClientAdapter = Platform.isAndroid
          ? CronetAdapter(_cronetEngine(), closeEngine: false)
          : NativeAdapter();
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
    // Not closed with the client (closeEngine defaults to false).
    return CronetClient.fromCronetEngine(_cronetEngine());
  }
  return null;
}
