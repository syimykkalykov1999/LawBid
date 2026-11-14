import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/uploads/file_ready.dart';
import 'package:lawbid/core/uploads/storage_uploader.dart';
import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/fake_http_adapter.dart';

class _NoTransport implements StorageTransport {
  @override
  Future<void> post(
    StorageTarget target,
    UploadBody body, {
    required String filename,
    required String mime,
    void Function(double progress)? onProgress,
    CancelToken? cancel,
    String? taskId,
  }) async {}
}

/// Owner row 106 (media audit 13.11, batch F item 14): with the realtime
/// socket up, the uploader waits for the server's `file:ready` instead of
/// asking every 700 ms.
void main() {
  var statusCalls = 0;
  var clean = false;

  StorageUploader uploader() => StorageUploader(
        apiDio: Dio(BaseOptions(baseUrl: 'https://api.test'))
          ..httpClientAdapter = FakeHttpAdapter((o) async {
            statusCalls++;
            return ok({
              'id': 'f1',
              'purpose': 'chat_attachment',
              'mime': 'image/jpeg',
              'sizeBytes': 3,
              'width': null,
              'height': null,
              'scanStatus': clean ? 'clean' : 'pending',
              'url': null,
              'createdAt': '2026-11-14T10:00:00.000Z',
            });
          }),
        transport: _NoTransport(),
      );

  setUp(() {
    statusCalls = 0;
    clean = false;
    ClientTuning.reset();
  });

  tearDown(FileReady.reset);

  test('socket up: one status read right after file:ready', () async {
    FileReady.connected = () => true;
    final done = uploader().waitClean('f1', status: api.ScanStatus.pending);
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(statusCalls, 0, reason: 'nothing asked while waiting for the push');
    clean = true;
    FileReady.add('f1');
    await done;
    expect(statusCalls, 1);
  });

  test('a push for another file does not end the wait', () async {
    FileReady.connected = () => true;
    var finished = false;
    final done = uploader()
        .waitClean('f1', status: api.ScanStatus.pending)
        .whenComplete(() => finished = true);
    FileReady.add('other');
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(finished, isFalse);
    expect(statusCalls, 0);
    clean = true;
    FileReady.add('f1');
    await done;
  });

  test('no socket: polls as before', () async {
    clean = true;
    await StorageUploader(
      apiDio: Dio(BaseOptions(baseUrl: 'https://api.test'))
        ..httpClientAdapter = FakeHttpAdapter((o) async {
          statusCalls++;
          return ok({
            'id': 'f1',
            'purpose': 'chat_attachment',
            'mime': 'image/jpeg',
            'sizeBytes': 3,
            'width': null,
            'height': null,
            'scanStatus': 'clean',
            'url': null,
            'createdAt': '2026-11-14T10:00:00.000Z',
          });
        }),
      transport: _NoTransport(),
      scanPoll: Duration.zero,
    ).waitClean('f1', status: api.ScanStatus.pending);
    expect(statusCalls, 1);
  });

  test('the admin safety poll still asks when no push comes', () async {
    ClientTuning.apply(const {'client.scan_poll_socket_ms': '500'});
    FileReady.connected = () => true;
    final done = uploader().waitClean('f1', status: api.ScanStatus.pending);
    await Future<void>.delayed(const Duration(milliseconds: 520));
    expect(statusCalls, 1);
    clean = true;
    FileReady.add('f1');
    await done;
  });
}
