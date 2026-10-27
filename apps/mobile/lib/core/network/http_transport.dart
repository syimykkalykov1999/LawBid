import 'package:dio/dio.dart';
import 'package:http/http.dart' as http;
import 'package:lawbid/core/network/http_transport_stub.dart'
    if (dart.library.io) 'package:lawbid/core/network/http_transport_io.dart'
    as impl;

/// S8-1 / S8-2 (speed): which network stack carries the phone's requests.
///
/// Before: plain `dart:io` HTTP/1.1, which closes idle sockets after 15 s, so
/// every burst after a short pause paid DNS + TCP + TLS again (300-600 ms on
/// a mobile link). Now (default `auto`): iOS uses URLSession and Android uses
/// Cronet (HTTP/2 + HTTP/3, the OS keeps connections and sessions between
/// bursts and app launches) through `native_dio_adapter`; if the native stack
/// cannot start, or on web / desktop, the tuned `dart:io` client is used
/// (idle 90 s, 6 connections per host). Off switch for a bad build:
/// `--dart-define=HTTP_NATIVE=off` (the tuned `dart:io` client stays).
///
/// Sources: native_dio_adapter (pub.dev, 1.8.0 2026-07), Cronet
/// (developer.android.com/develop/connectivity/cronet), URLSession
/// (developer.apple.com/documentation/foundation/urlsession).
abstract final class HttpTransport {
  static const _mode =
      String.fromEnvironment('HTTP_NATIVE', defaultValue: 'auto');

  /// `false` when the build was made with `HTTP_NATIVE=off`.
  static bool get nativeEnabled => _mode != 'off';

  /// Puts the transport on [dio]. Never throws: on any failure [dio] keeps
  /// the adapter it has.
  static void apply(Dio dio) {
    try {
      impl.applyAdapter(dio, native: nativeEnabled);
    } catch (_) {
      // Keep Dio's default adapter.
    }
  }

  /// A `package:http` client on the native stack for the image caches
  /// (`HttpFileService`), or null where there is none (web, tests, fallback).
  static http.Client? nativeClient() {
    if (!nativeEnabled) return null;
    try {
      return impl.createNativeClient();
    } catch (_) {
      return null;
    }
  }
}
