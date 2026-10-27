import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/http_transport.dart';
import 'package:lawbid/core/network/http_transport_io.dart' as io;

void main() {
  test('desktop / test host falls back to the tuned dart:io adapter', () {
    final dio = Dio();
    HttpTransport.apply(dio);
    expect(dio.httpClientAdapter, isA<IOHttpClientAdapter>());
  });

  test('tuned adapter keeps idle sockets 90 s and 6 per host (S8-2)', () {
    final adapter = io.tunedIoAdapter();
    final client = adapter.createHttpClient!();
    expect(client.idleTimeout, const Duration(seconds: 90));
    expect(client.maxConnectionsPerHost, 6);
    client.close(force: true);
  });

  test('no native client on the test host', () {
    expect(HttpTransport.nativeClient(), isNull);
  });
}
