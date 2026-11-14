import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/transfers/adaptive_limiter.dart';
import 'package:lawbid/core/uploads/foreground_parts.dart';
import 'package:lawbid/core/uploads/storage_uploader.dart';
import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/fake_http_adapter.dart';

/// Owner row 100 (media audit 13.11, batch E item 11): when the app leaves
/// the screen in the middle of a big file, the parts still missing go on as
/// OS transfers instead of the whole file starting again.

class _RecordingTransport implements StorageTransport {
  final targets = <StorageTarget>[];

  @override
  Future<void> post(
    StorageTarget target,
    UploadBody body, {
    required String filename,
    required String mime,
    void Function(double progress)? onProgress,
    CancelToken? cancel,
    String? taskId,
  }) async =>
      targets.add(target);
}

class _FakeParts implements BackgroundParts {
  _FakeParts({this.on = true, this.result = true});

  final bool on;
  final bool result;
  final sent = <List<StoragePart>>[];
  final settled = <String>[];

  @override
  bool get enabled => on;

  @override
  Future<bool> send(
    String taskId,
    UploadBody body,
    List<StoragePart> parts, {
    void Function(int bytes)? onPartDone,
    CancelToken? cancel,
  }) async {
    sent.add(parts);
    if (result) {
      for (final p in parts) {
        onPartDone?.call(p.end - p.start);
      }
    }
    return result;
  }

  @override
  Future<void> settle(String taskId) async => settled.add(taskId);
}

UploadBody _big(Directory dir, int size) {
  final f = File('${dir.path}/big-$size.bin');
  f.openSync(mode: FileMode.write)
    ..truncateSync(size)
    ..closeSync();
  return UploadBody.file(f.path);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const mib = 1024 * 1024;

  late FakeHttpAdapter apiAdapter;
  late FakeHttpAdapter storage;
  late _RecordingTransport os;
  late ForegroundParts gate;
  late Directory dir;
  var presigns = 0;
  var plans = 0;
  var completes = 0;

  /// 1st plan: three parts; 2nd (the app left after part 1): parts 2 and 3;
  /// 3rd (after the OS sent them): nothing missing.
  Map<String, Object?> plan(int n) => {
        'partSizeBytes': 8 * mib,
        'partCount': 3,
        'uploadedParts': n == 1
            ? <int>[]
            : n == 2
                ? [1]
                : [1, 2, 3],
        'parts': [
          for (final p in n == 1
              ? [1, 2, 3]
              : n == 2
                  ? [2, 3]
                  : <int>[])
            {'partNumber': p, 'url': 'https://s3.test/p$p'},
        ],
        'expiresAt': '2026-11-14T12:00:00.000Z',
      };

  StorageUploader uploader(BackgroundParts parts) => StorageUploader(
        apiDio: Dio(BaseOptions(baseUrl: 'https://api.test'))
          ..httpClientAdapter = apiAdapter,
        transport: os,
        storageDio: Dio()..httpClientAdapter = storage,
        partsGate: gate,
        backgroundParts: parts,
        partBackoff: (_) => Duration.zero,
        limiter: AdaptiveLimiter(() => 1),
        scanPoll: Duration.zero,
        scanMaxPolls: 2,
      );

  Future<String> send(
    BackgroundParts parts, {
    String? resume,
    void Function(double)? onProgress,
  }) =>
      uploader(parts).upload(
        purpose: api.FilePurpose.chatAttachment,
        body: _big(dir, 20 * mib),
        mime: 'video/mp4',
        taskId: 'job-1',
        resumeFileId: resume,
        onProgress: onProgress,
      );

  setUp(() {
    dir = Directory.systemTemp.createTempSync('bg-parts');
    presigns = 0;
    plans = 0;
    completes = 0;
    os = _RecordingTransport();
    gate = ForegroundParts(
      enabled: () => true,
      osTransferKnown: (_) async => false,
      handsOff: true,
      observeLifecycle: false,
      initial: AppLifecycleState.resumed,
    );
    // The app leaves the screen while the first part is on its way.
    storage = FakeHttpAdapter((o) async {
      gate.didChangeAppLifecycleState(AppLifecycleState.paused);
      await Future<void>.delayed(const Duration(milliseconds: 5));
      return ResponseBody.fromString('', 200);
    });
    apiAdapter = FakeHttpAdapter((o) async {
      if (o.path == '/files/presign') {
        presigns++;
        return jsonBody(
          {
            'data': {
              'fileId': 'file-$presigns',
              'upload': {
                'url': 'https://storage.test/bucket',
                'fields': {'key': 'k'},
              },
              'expiresAt': '2026-11-14T10:05:00.000Z',
            },
          },
          201,
        );
      }
      if (o.path.endsWith('/multipart')) {
        plans++;
        return jsonBody({'data': plan(plans)});
      }
      if (o.path.endsWith('/multipart/complete')) {
        completes++;
        return jsonBody({
          'data': {'sizeBytes': 20 * mib},
        });
      }
      return ok({
        'id': 'file-1',
        'purpose': 'chat_attachment',
        'mime': 'video/mp4',
        'sizeBytes': 20 * mib,
        'width': null,
        'height': null,
        'scanStatus': 'clean',
        'url': null,
        'createdAt': '2026-11-14T10:00:00.000Z',
      });
    });
  });

  tearDown(() => dir.deleteSync(recursive: true));

  test(
      'leaving the screen: the missing parts go to the OS one by one, '
      'then they are assembled — the file never starts again', () async {
    final parts = _FakeParts();
    final progress = <double>[];
    final id = await send(parts, onProgress: progress.add);
    expect(id, 'file-1');
    expect(presigns, 1, reason: 'no new link, no second copy of the file');
    expect(os.targets, isEmpty, reason: 'no whole-file OS transfer');
    expect(parts.sent, hasLength(1));
    expect(
      [for (final p in parts.sent.single) (p.number, p.start, p.end, p.url)],
      [
        (2, 8 * mib, 16 * mib, 'https://s3.test/p2'),
        (3, 16 * mib, 20 * mib, 'https://s3.test/p3'),
      ],
    );
    expect(completes, 1);
    expect(progress.last, 1.0);
  });

  test('a part the OS could not send: the whole file goes as before', () async {
    final parts = _FakeParts(result: false);
    final id = await send(parts);
    expect(parts.sent, hasLength(1));
    expect(os.targets, hasLength(1));
    expect(presigns, 2);
    expect(id, 'file-2');
    expect(completes, 0);
  });

  test('switched off: the whole file goes to the OS (today)', () async {
    final parts = _FakeParts(on: false);
    await send(parts);
    expect(parts.sent, isEmpty);
    expect(os.targets, hasLength(1));
  });

  test('a restart with a saved id first stops the OS parts of that job',
      () async {
    final parts = _FakeParts();
    // On screen the whole way this time.
    storage.handler = (o) async => ResponseBody.fromString('', 200);
    final id = await send(parts, resume: 'file-9');
    expect(id, 'file-9');
    expect(parts.settled, ['job-1']);
  });
}
