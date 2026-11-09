import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/uploads/storage_uploader.dart';
import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/fake_http_adapter.dart';

/// Owner 2026-11-08: with the switch on R2 a public photo never goes to AWS;
/// while R2 is not ready the server says «busy, try again» and the photo
/// waits quietly, then goes up once R2 answers.
void main() {
  setUp(() => StorageUploader.storageBusyWait = (_) => Duration.zero);

  ResponseBody busy() => jsonBody(
        {
          'error': {
            'code': 'FILE_STORAGE_UNAVAILABLE',
            'message': 'busy',
            'details': {'retryAfterSeconds': 30},
          },
        },
        503,
      );

  ResponseBody presigned() => jsonBody(
        {
          'data': {
            'fileId': 'file-1',
            'upload': {
              'url': 'https://r2.test/put',
              'fields': <String, String>{},
              'method': 'PUT',
              'headers': {'Content-Type': 'image/png'},
            },
            'expiresAt': '2026-11-08T10:05:00.000Z',
          },
        },
        201,
      );

  ResponseBody clean() => ok({
        'id': 'file-1',
        'purpose': 'avatar',
        'mime': 'image/png',
        'sizeBytes': 3,
        'width': null,
        'height': null,
        'scanStatus': 'clean',
        'url': null,
        'createdAt': '2026-11-08T10:00:00.000Z',
      });

  StorageUploader uploader(FakeHttpAdapter api, FakeHttpAdapter storage) =>
      StorageUploader.dio(
        Dio(BaseOptions(baseUrl: 'https://api.test'))..httpClientAdapter = api,
        Dio()..httpClientAdapter = storage,
      );

  test('R2 not ready, then back: the photo waits and goes up to R2', () async {
    var presigns = 0;
    final apiAdapter = FakeHttpAdapter((o) async {
      if (o.path == '/files/presign') {
        presigns++;
        return presigns <= 2 ? busy() : presigned();
      }
      return clean();
    });
    final storage =
        FakeHttpAdapter((o) async => ResponseBody.fromString('', 200));
    final id = await uploader(apiAdapter, storage).upload(
      purpose: api.FilePurpose.avatar,
      body: UploadBody.bytes(Uint8List.fromList([1, 2, 3])),
      mime: 'image/png',
    );
    expect(id, 'file-1');
    expect(presigns, 3);
    expect(storage.requests.single.uri.host, 'r2.test');
  });

  test('still not ready after the quiet waits: the error is shown', () async {
    final apiAdapter = FakeHttpAdapter((o) async => busy());
    final storage =
        FakeHttpAdapter((o) async => ResponseBody.fromString('', 200));
    await expectLater(
      uploader(apiAdapter, storage).upload(
        purpose: api.FilePurpose.avatar,
        body: UploadBody.bytes(Uint8List.fromList([1, 2, 3])),
        mime: 'image/png',
      ),
      throwsA(
        isA<ApiException>()
            .having((e) => e.code, 'code', 'FILE_STORAGE_UNAVAILABLE'),
      ),
    );
    expect(storage.requests, isEmpty);
  });
}
