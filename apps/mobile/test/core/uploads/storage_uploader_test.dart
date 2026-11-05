import 'dart:convert';
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

  group('resumable (multipart) upload', () {
    const mib = 1024 * 1024;
    final big = UploadBody.bytes(Uint8List(20 * mib)); // 8 + 8 + 4 MiB

    Map<String, Object?> plan(List<int> uploaded, List<int> todo) => {
          'data': {
            'partSizeBytes': 8 * mib,
            'partCount': 3,
            'uploadedParts': uploaded,
            'parts': [
              for (final n in todo)
                {'partNumber': n, 'url': 'https://s3.test/p$n'},
            ],
            'expiresAt': '2026-11-01T12:00:00.000Z',
          },
        };

    StorageUploader resumable() => StorageUploader(
          apiDio: apiDio,
          transport:
              DioStorageTransport(storageDio, backoff: (_) => Duration.zero),
          scanPoll: Duration.zero,
          scanMaxPolls: 3,
          storageDio: storageDio,
          partBackoff: (_) => Duration.zero,
        );

    test('sends the parts with exact ranges, then completes', () async {
      var plans = 0;
      final inner = apiAdapter.handler;
      apiAdapter.handler = (o) async {
        if (o.path == '/files/file-1/multipart') {
          plans++;
          return jsonBody(
            plans == 1 ? plan([], [1, 2, 3]) : plan([1, 2, 3], []),
          );
        }
        if (o.path == '/files/file-1/multipart/complete') {
          return jsonBody({
            'data': {'sizeBytes': 20 * mib},
          });
        }
        return inner(o);
      };
      final progress = <double>[];
      final ok = await resumable().putResumable(
        'file-1',
        big,
        onProgress: progress.add,
      );
      expect(ok, isTrue);
      expect(storage.requests.map((r) => r.path), [
        'https://s3.test/p1',
        'https://s3.test/p2',
        'https://s3.test/p3',
      ]);
      expect(storage.requests.map((r) => r.headers['content-length']), [
        8 * mib,
        8 * mib,
        4 * mib,
      ]);
      expect(progress.last, 1.0);
      expect(
        apiAdapter.requests.map((r) => r.path).last,
        '/files/file-1/multipart/complete',
      );
    });

    test('a resume sends only the parts storage lacks', () async {
      var plans = 0;
      apiAdapter.handler = (o) async {
        if (o.path == '/files/file-1/multipart') {
          plans++;
          return jsonBody(
            plans == 1 ? plan([1, 3], [2]) : plan([1, 2, 3], []),
          );
        }
        return jsonBody({
          'data': {'sizeBytes': 20 * mib},
        });
      };
      await resumable().putResumable('file-1', big);
      expect(storage.requests.map((r) => r.path), ['https://s3.test/p2']);
    });

    test('a lost connection retries only that part', () async {
      var plans = 0;
      apiAdapter.handler = (o) async {
        if (o.path == '/files/file-1/multipart') {
          plans++;
          return jsonBody(
            plans == 1 ? plan([1, 3], [2]) : plan([1, 2, 3], []),
          );
        }
        return jsonBody({
          'data': {'sizeBytes': 20 * mib},
        });
      };
      var calls = 0;
      storage.handler = (o) async {
        calls++;
        if (calls == 1) throwConnectionError(o);
        return ResponseBody.fromString('', 200);
      };
      await resumable().putResumable('file-1', big);
      expect(calls, 2);
    });

    test('flag off or a small file: false, nothing sent to storage', () async {
      apiAdapter.handler = (o) async => jsonBody(
            {
              'error': {'code': 'FEATURE_DISABLED', 'message': 'off'},
            },
            403,
          );
      expect(await resumable().putResumable('file-1', big), isFalse);
      expect(
        await resumable()
            .putResumable('file-1', UploadBody.bytes(Uint8List(3))),
        isFalse,
      );
      expect(storage.requests, isEmpty);
    });
  });

  group('a queue job the OS transfer outlives (the app was closed)', () {
    late Set<String> inStorage;
    late List<String> confirmed;
    late _OsTransport os;
    var presigns = 0;
    final forgotten = <String>[];

    StorageUploader queued() => StorageUploader(
          apiDio: apiDio,
          transport: os,
          scanPoll: Duration.zero,
          scanMaxPolls: 3,
          forgetTransfer: (id) async {
            forgotten.add(id);
            if (!os.keepRecord) os.recordComplete = false;
          },
        );

    Future<String> send({StorageTarget? saved, List<StorageTarget>? kept}) =>
        queued().upload(
          purpose: api.FilePurpose.chatAttachment,
          body: UploadBody.bytes(Uint8List.fromList([1, 2, 3])),
          mime: 'image/png',
          taskId: 'job-1',
          savedTarget: saved,
          onTarget: (t) async => kept?.add(t),
        );

    setUp(() {
      inStorage = {};
      confirmed = [];
      presigns = 0;
      forgotten.clear();
      os = _OsTransport(inStorage);
      apiAdapter.handler = (o) async {
        if (o.path == '/files/presign') {
          presigns++;
          return jsonBody(
            {
              'data': {
                'fileId': 'new-$presigns',
                'upload': {
                  'url': 'https://storage.test/new-$presigns',
                  'fields': {'key': 'new-$presigns'},
                },
                'expiresAt': '2026-11-05T10:05:00.000Z',
              },
            },
            201,
          );
        }
        final id = o.path.split('/')[2];
        if (o.path.endsWith('/confirm')) {
          confirmed.add(id);
          if (!inStorage.contains(id)) {
            return jsonBody(
              {
                'error': {
                  'code': ApiErrorCodes.fileNotUploaded,
                  'message': 'Upload the file before confirming it.',
                },
              },
              409,
            );
          }
        }
        return fileDto('clean');
      };
    });

    test('the target is saved BEFORE the transfer starts', () async {
      final kept = <StorageTarget>[];
      os.onPost = () => expect(kept, hasLength(1));
      expect(await send(kept: kept), 'new-1');
      expect(kept.single.fileId, 'new-1');
    });

    test(
        'the transfer finished while closed: the same file is confirmed, '
        'no new link, nothing sent twice', () async {
      inStorage.add('old');
      os.recordComplete = true;
      const saved = StorageTarget(
        fileId: 'old',
        url: 'https://storage.test/old',
        fields: {'key': 'old'},
      );
      expect(await send(saved: saved), 'old');
      expect(presigns, 0);
      expect(confirmed, ['old']);
      expect(os.sent, isEmpty);
    });

    test(
        'a finished record and no saved target (a job from an older build): '
        'one fresh start instead of «not sent» for good', () async {
      os.recordComplete = true;
      expect(await send(), 'new-2');
      expect(forgotten, ['job-1']);
      expect(presigns, 2);
      expect(os.sent, ['new-2']);
    });

    test('the saved target is too old: a fresh start, sent once', () async {
      const saved = StorageTarget(
        fileId: 'old',
        url: 'https://storage.test/old',
        fields: {'key': 'old'},
      );
      os.refuse = {'old'};
      expect(await send(saved: saved), 'new-1');
      expect(os.sent, ['new-1']);
    });

    test('nothing in storage twice running: the refusal reaches the job',
        () async {
      os
        ..recordComplete = true
        ..keepRecord = true;
      await expectLater(
        queued().upload(
          purpose: api.FilePurpose.chatAttachment,
          body: UploadBody.bytes(Uint8List.fromList([1])),
          mime: 'image/png',
          taskId: 'job-1',
          onTarget: (_) async {},
        ),
        throwsA(
          isA<ApiException>()
              .having((e) => e.code, 'code', ApiErrorCodes.fileNotUploaded),
        ),
      );
      expect(presigns, 2);
    });

    test('no job id: no second try (a direct upload)', () async {
      os.recordComplete = true;
      await expectLater(
        queued().upload(
          purpose: api.FilePurpose.chatAttachment,
          body: UploadBody.bytes(Uint8List.fromList([1])),
          mime: 'image/png',
        ),
        throwsA(isA<ApiException>()),
      );
      expect(presigns, 1);
    });

    test('a target survives its trip through the job', () {
      const t = StorageTarget(
        fileId: 'f',
        url: 'https://u',
        fields: {'a': 'b'},
        method: 'PUT',
        headers: {'c': 'd'},
      );
      final back = StorageTarget.fromJson(jsonDecode(jsonEncode(t.toJson())))!;
      expect(back.fileId, 'f');
      expect(back.isPut, isTrue);
      expect(back.fields, {'a': 'b'});
      expect(back.headers, {'c': 'd'});
      expect(StorageTarget.fromJson(null), isNull);
      expect(StorageTarget.fromJson({'url': 1}), isNull);
    });
  });
}

/// What BackgroundStorageTransport does with a record: a finished one sends
/// nothing.
class _OsTransport implements StorageTransport {
  _OsTransport(this.inStorage);

  final Set<String> inStorage;
  final sent = <String>[];
  bool recordComplete = false;
  bool keepRecord = false;
  Set<String> refuse = const {};
  void Function()? onPost;

  @override
  Future<void> post(
    StorageTarget target,
    UploadBody body, {
    required String filename,
    required String mime,
    void Function(double progress)? onProgress,
    CancelToken? cancel,
    String? taskId,
  }) async {
    onPost?.call();
    if (recordComplete) return;
    if (refuse.contains(target.fileId)) {
      throw const ApiException(
        code: ApiErrorCodes.fileNotUploaded,
        message: 'expired',
        statusCode: 403,
      );
    }
    sent.add(target.fileId);
    inStorage.add(target.fileId);
  }
}
