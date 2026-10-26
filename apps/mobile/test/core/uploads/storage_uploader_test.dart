import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/uploads/storage_uploader.dart';
import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/fake_http_adapter.dart';

/// Owner 2026-10-22 (audit #4 §3): the one shared uploader — presign →
/// storage POST (retried with backoff) → confirm → wait for a clean scan.
void main() {
  late FakeHttpAdapter apiAdapter;
  late FakeHttpAdapter storage;
  late Dio apiDio;
  late Dio storageDio;
  var scans = <String>[];

  ResponseBody fileDto(String scan) => ok({
        'id': 'file-1',
        'purpose': 'chat_attachment',
        'mime': 'image/png',
        'sizeBytes': 3,
        'width': null,
        'height': null,
        'scanStatus': scan,
        'url': null,
        'createdAt': '2026-10-22T10:00:00.000Z',
      });

  setUp(() {
    scans = ['clean'];
    apiAdapter = FakeHttpAdapter((o) async {
      if (o.path == '/files/presign') {
        return jsonBody(
          {
            'data': {
              'fileId': 'file-1',
              'upload': {
                'url': 'https://storage.test/bucket',
                'fields': {'key': 'k', 'policy': 'p'},
              },
              'expiresAt': '2026-10-22T10:05:00.000Z',
            },
          },
          201,
        );
      }
      return fileDto(scans.length > 1 ? scans.removeAt(0) : scans.first);
    });
    apiDio = Dio(BaseOptions(baseUrl: 'https://api.test'))
      ..httpClientAdapter = apiAdapter;
    storage = FakeHttpAdapter((o) async => ResponseBody.fromString('', 204));
    storageDio = Dio()..httpClientAdapter = storage;
  });

  StorageUploader uploader({int attempts = 4}) => StorageUploader(
        apiDio: apiDio,
        transport: DioStorageTransport(
          storageDio,
          attempts: attempts,
          backoff: (_) => Duration.zero,
        ),
        scanPoll: Duration.zero,
        scanMaxPolls: 3,
      );

  test('all four steps; the file part goes last; the scan is waited for',
      () async {
    scans = ['pending', 'pending', 'clean'];
    final id = await uploader().upload(
      purpose: api.FilePurpose.chatAttachment,
      body: UploadBody.bytes(Uint8List.fromList([1, 2, 3])),
      mime: 'image/png',
    );
    expect(id, 'file-1');
    final presign = apiAdapter.requests.first.data as Map<String, dynamic>;
    expect(presign['purpose'], 'chat_attachment');
    expect(presign['sizeBytes'], 3);
    final form = storage.requests.single.data as FormData;
    expect(form.fields.map((f) => f.key), ['key', 'policy']);
    expect(form.files.single.key, 'file');
    expect(
      apiAdapter.requests.map((r) => r.path),
      [
        '/files/presign',
        '/files/file-1/confirm',
        '/files/file-1',
        '/files/file-1',
      ],
    );
  });

  test('the app tells the server it can do a PUT', () async {
    await uploader().upload(
      purpose: api.FilePurpose.avatar,
      body: UploadBody.bytes(Uint8List.fromList([1, 2, 3])),
      mime: 'image/png',
    );
    final presign = apiAdapter.requests.first.data as Map<String, dynamic>;
    expect(presign['supportsPut'], true);
  });

  test('R2: a presigned PUT sends the raw file with the signed headers',
      () async {
    final plain = apiAdapter.handler;
    apiAdapter.handler = (o) async {
      if (o.path == '/files/presign') {
        return jsonBody(
          {
            'data': {
              'fileId': 'file-1',
              'upload': {
                'url': 'https://r2.test/bucket/key',
                'fields': <String, String>{},
                'method': 'PUT',
                'headers': {
                  'Content-Type': 'image/png',
                  'Cache-Control': 'public, max-age=31536000, immutable',
                },
              },
              'expiresAt': '2026-10-22T10:05:00.000Z',
            },
          },
          201,
        );
      }
      return plain(o);
    };
    final id = await uploader().upload(
      purpose: api.FilePurpose.avatar,
      body: UploadBody.bytes(Uint8List.fromList([1, 2, 3])),
      mime: 'image/png',
    );
    expect(id, 'file-1');
    final put = storage.requests.single;
    expect(put.method, 'PUT');
    expect(put.path, 'https://r2.test/bucket/key');
    expect(put.headers['Content-Type'], 'image/png');
    expect(put.headers['Cache-Control'], contains('immutable'));
    expect(put.headers['content-length'], 3);
    expect(put.data, isNot(isA<FormData>()));
  });

  test('a PUT that fails is retried like a POST', () async {
    var calls = 0;
    storage.handler = (o) async {
      calls++;
      return calls == 1
          ? ResponseBody.fromString('busy', 503)
          : ResponseBody.fromString('', 200);
    };
    await uploader().put(
      const StorageTarget(
        fileId: 'f',
        url: 'https://r2.test/k',
        fields: {},
        method: 'PUT',
        headers: {'Content-Type': 'image/png'},
      ),
      UploadBody.bytes(Uint8List(3)),
      mime: 'image/png',
    );
    expect(calls, 2);
  });

  test('a lost connection or a busy storage is tried again', () async {
    var calls = 0;
    storage.handler = (o) async {
      calls++;
      if (calls == 1) throwConnectionError(o);
      if (calls == 2) return ResponseBody.fromString('busy', 503);
      return ResponseBody.fromString('', 204);
    };
    await uploader().upload(
      purpose: api.FilePurpose.chatVoice,
      body: UploadBody.bytes(Uint8List(3)),
      mime: 'audio/mp4',
    );
    expect(calls, 3);
  });

  test('a refusal is not repeated and keeps the storage status', () async {
    storage.handler = (o) async => ResponseBody.fromString('denied', 403);
    await expectLater(
      uploader().upload(
        purpose: api.FilePurpose.chatVoice,
        body: UploadBody.bytes(Uint8List(3)),
        mime: 'audio/mp4',
      ),
      throwsA(
        isA<ApiException>()
            .having((e) => e.code, 'code', ApiErrorCodes.fileNotUploaded)
            .having((e) => e.statusCode, 'status', 403),
      ),
    );
    expect(storage.requests, hasLength(1));
  });

  test('gives up after the last attempt with a network error', () async {
    storage.handler = throwConnectionError;
    await expectLater(
      uploader(attempts: 2).upload(
        purpose: api.FilePurpose.chatVoice,
        body: UploadBody.bytes(Uint8List(3)),
        mime: 'audio/mp4',
      ),
      throwsA(
        isA<ApiException>().having(
          (e) => e.code,
          'code',
          ApiException.networkErrorCode,
        ),
      ),
    );
    expect(storage.requests, hasLength(2));
  });

  test('an unclean scan is FILE_NOT_ATTACHABLE', () async {
    scans = ['infected'];
    await expectLater(
      uploader().upload(
        purpose: api.FilePurpose.chatAttachment,
        body: UploadBody.bytes(Uint8List(3)),
        mime: 'image/png',
      ),
      throwsA(
        isA<ApiException>()
            .having((e) => e.code, 'code', ApiErrorCodes.fileNotAttachable),
      ),
    );
  });

  test('a file body is hashed and streamed from disk', () async {
    final dir = await Directory.systemTemp.createTemp('upload_body');
    addTearDown(() => dir.delete(recursive: true));
    final f = File('${dir.path}/a.bin')
      ..writeAsBytesSync(Uint8List.fromList([1, 2, 3]));
    final body = UploadBody.file(f.path);
    expect(await body.length(), 3);
    expect(
      await body.sha256Hex(),
      sha256Hex(Uint8List.fromList([1, 2, 3])),
    );
    await uploader().upload(
      purpose: api.FilePurpose.chatAttachment,
      body: body,
      mime: 'application/octet-stream',
    );
    expect(storage.requests, hasLength(1));
  });
}
