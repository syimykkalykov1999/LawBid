import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';

import '../../helpers/fake_http_adapter.dart';

/// Foreman re-check 25.11 (items 1 + 11): prod has `group_files_from_disk`
/// stored OFF, so a group file goes up through `ApiChatRepository
/// .uploadAttachment` (the screen's `uploadAndSend`), not the queue. That
/// path still waited for the antivirus (40 polls × 0.7 s ≈ 28 s) and then
/// failed with «scan». M3 (PR #1300, Slack / Telegram): the message goes once
/// storage has the file; the server holds it back from the others until the
/// scan is clean — the flag-off path now does the same as the queue job.
void main() {
  late FakeHttpAdapter apiAdapter;
  late String scan;

  ResponseBody fileDto() => ok({
        'id': 'file-1',
        'purpose': 'chat_attachment',
        'mime': 'application/pdf',
        'sizeBytes': 3,
        'width': null,
        'height': null,
        'scanStatus': scan,
        'url': null,
        'createdAt': '2026-11-25T10:00:00.000Z',
      });

  ApiChatRepository repo() {
    apiAdapter = FakeHttpAdapter((o) async {
      if (o.path == '/files/presign') {
        return jsonBody(
          {
            'data': {
              'fileId': 'file-1',
              'upload': {
                'url': 'https://storage.test/bucket',
                'fields': {'key': 'k'},
              },
              'expiresAt': '2026-11-25T10:05:00.000Z',
            },
          },
          201,
        );
      }
      return fileDto();
    });
    final apiDio = Dio(BaseOptions(baseUrl: 'https://api.test'))
      ..httpClientAdapter = apiAdapter;
    final storageDio = Dio()
      ..httpClientAdapter =
          FakeHttpAdapter((o) async => ResponseBody.fromString('', 204));
    return ApiChatRepository(apiDio, storageDio: storageDio);
  }

  Iterable<String> scanPolls() => apiAdapter.requests
      .where((r) => r.method == 'GET' && r.path == '/files/file-1')
      .map((r) => r.path);

  setUp(() => scan = 'pending');

  test('flag off: a group file goes while its scan still runs, no wait',
      () async {
    final r = repo();
    final id = await r
        .uploadAttachment(Uint8List.fromList([1, 2, 3]), 'application/pdf')
        .timeout(const Duration(seconds: 3));
    expect(id, 'file-1');
    expect(scanPolls(), isEmpty, reason: 'the antivirus is not polled');
  });

  test('flag off: a voice note goes while its scan still runs, no wait',
      () async {
    final r = repo();
    final id = await r
        .uploadVoice(Uint8List.fromList([0, 0, 0, 0x18, 0x66, 0x74, 0x79]))
        .timeout(const Duration(seconds: 3));
    expect(id, 'file-1');
    expect(scanPolls(), isEmpty);
  });

  test('a file the scan already refused still stops the message', () async {
    scan = 'infected';
    await expectLater(
      repo().uploadAttachment(Uint8List.fromList([1, 2, 3]), 'application/pdf'),
      throwsA(
        isA<ApiException>()
            .having((e) => e.code, 'code', ApiErrorCodes.fileNotAttachable),
      ),
    );
  });
}
