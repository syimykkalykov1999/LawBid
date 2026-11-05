import 'dart:async';
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

class _RecordingTransport implements StorageTransport {
  final targets = <StorageTarget>[];
  final taskIds = <String?>[];

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
    targets.add(target);
    taskIds.add(taskId);
  }
}

/// A big body in a real file (sparse: no disk or time spent on zeros).
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

  group('ForegroundParts', () {
    ForegroundParts gate({
      bool enabled = true,
      bool known = false,
      bool handsOff = true,
      AppLifecycleState initial = AppLifecycleState.resumed,
    }) =>
        ForegroundParts(
          enabled: () => enabled,
          osTransferKnown: (_) async => known,
          handsOff: handsOff,
          observeLifecycle: false,
          initial: initial,
        );

    test('allowed only with the flag, on screen, with no OS transfer',
        () async {
      expect(await gate().allows('t'), isTrue);
      expect(await gate(enabled: false).allows('t'), isFalse);
      expect(await gate(known: true).allows('t'), isFalse);
      expect(
        await gate(initial: AppLifecycleState.paused).allows('t'),
        isFalse,
      );
    });

    test('a short interruption (inactive) does not stop the parts', () async {
      final g = gate()..didChangeAppLifecycleState(AppLifecycleState.inactive);
      var left = false;
      unawaited(g.whenLeft.then((_) => left = true));
      await Future<void>.delayed(const Duration(milliseconds: 5));
      expect(left, isFalse);
      expect(await g.allows('t'), isTrue);
    });

    for (final s in [AppLifecycleState.hidden, AppLifecycleState.paused]) {
      test('$s stops the parts; coming back allows them again', () async {
        final g = gate();
        final left = g.whenLeft;
        g.didChangeAppLifecycleState(s);
        await left;
        expect(await g.allows('t'), isFalse);
        g.didChangeAppLifecycleState(AppLifecycleState.resumed);
        expect(await g.allows('t'), isTrue);
      });
    }

    test('the browser: a hidden tab carries on, nothing to hand over',
        () async {
      final g = gate(handsOff: false)
        ..didChangeAppLifecycleState(AppLifecycleState.hidden);
      expect(await g.allows('t'), isTrue);
    });
  });

  group('a queued file with the gate', () {
    late FakeHttpAdapter apiAdapter;
    late FakeHttpAdapter storage;
    late _RecordingTransport os;
    late ForegroundParts gate;
    late Directory dir;
    var presigns = 0;
    var plans = 0;
    final planned = <String>[];

    StorageUploader uploader() => StorageUploader(
          apiDio: Dio(BaseOptions(baseUrl: 'https://api.test'))
            ..httpClientAdapter = apiAdapter,
          transport: os,
          storageDio: Dio()..httpClientAdapter = storage,
          partsGate: gate,
          partBackoff: (_) => Duration.zero,
          limiter: AdaptiveLimiter(() => 4),
          scanPoll: Duration.zero,
          scanMaxPolls: 2,
        );

    Future<String> send(
      UploadBody body, {
      String? resume,
      void Function(String)? onId,
      CancelToken? cancel,
    }) =>
        uploader().upload(
          purpose: api.FilePurpose.chatAttachment,
          body: body,
          mime: 'video/mp4',
          taskId: 'job-1',
          resumeFileId: resume,
          onPartsFileId: onId,
          cancel: cancel,
        );

    tearDown(() => dir.deleteSync(recursive: true));

    setUp(() {
      dir = Directory.systemTemp.createTempSync('parts');
      presigns = 0;
      plans = 0;
      planned.clear();
      os = _RecordingTransport();
      gate = ForegroundParts(
        enabled: () => true,
        osTransferKnown: (_) async => false,
        handsOff: true,
        observeLifecycle: false,
        initial: AppLifecycleState.resumed,
      );
      storage = FakeHttpAdapter((o) async => ResponseBody.fromString('', 200));
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
                'expiresAt': '2026-11-05T10:05:00.000Z',
              },
            },
            201,
          );
        }
        if (o.path.endsWith('/multipart')) {
          planned.add(o.path);
          plans++;
          return jsonBody({
            'data': {
              'partSizeBytes': 8 * mib,
              'partCount': 3,
              'uploadedParts': plans == 1 ? <int>[] : [1, 2, 3],
              'parts': plans == 1
                  ? [
                      for (var n = 1; n <= 3; n++)
                        {'partNumber': n, 'url': 'https://s3.test/p$n'},
                    ]
                  : <Object>[],
              'expiresAt': '2026-11-05T12:00:00.000Z',
            },
          });
        }
        if (o.path.endsWith('/multipart/complete')) {
          return jsonBody({
            'data': {'sizeBytes': 20 * mib},
          });
        }
        return ok({
          'id': 'file-1',
          'purpose': 'chat_attachment',
          'mime': 'video/mp4',
          'sizeBytes': 3,
          'width': null,
          'height': null,
          'scanStatus': 'clean',
          'url': null,
          'createdAt': '2026-11-05T10:00:00.000Z',
        });
      });
    });

    test('on screen: parts, no OS transfer; the id is saved first', () async {
      final saved = <String>[];
      final id = await send(_big(dir, 20 * mib), onId: saved.add);
      expect(id, 'file-1');
      expect(saved, ['file-1']);
      expect(os.targets, isEmpty);
      expect(storage.requests, hasLength(3));
    });

    test('a small file goes to the OS transfer, no plan is asked', () async {
      await send(_big(dir, mib));
      expect(plans, 0);
      expect(os.targets, hasLength(1));
      expect(os.taskIds, ['job-1']);
    });

    test(
        'leaving the screen: parts stop, the OS gets the whole file on a '
        'fresh link, and the message uses that file', () async {
      storage.handler = (o) async {
        gate.didChangeAppLifecycleState(AppLifecycleState.paused);
        await Future<void>.delayed(const Duration(milliseconds: 5));
        return ResponseBody.fromString('', 200);
      };
      final id = await send(_big(dir, 20 * mib));
      expect(os.targets, hasLength(1));
      expect(os.taskIds, ['job-1']);
      expect(presigns, 2, reason: 'the first link may have expired');
      expect(id, 'file-2');
      expect(
        apiAdapter.requests.where((r) => r.path.endsWith('complete')),
        isEmpty,
        reason: 'the parts are left for the storage cleanup',
      );
    });

    test('after a restart only what storage lacks goes, on the saved id',
        () async {
      final id = await send(_big(dir, 20 * mib), resume: 'file-9');
      expect(id, 'file-9');
      expect(presigns, 0);
      expect(planned.first, '/files/file-9/multipart');
    });

    test('the saved id is over (the server says so): a fresh start', () async {
      final inner = apiAdapter.handler;
      apiAdapter.handler = (o) async {
        if (o.path == '/files/file-9/multipart') {
          return jsonBody(
            {
              'error': {'code': 'INTERNAL', 'message': 'x'},
            },
            409,
          );
        }
        return inner(o);
      };
      final saved = <String>[];
      final id = await send(
        _big(dir, 20 * mib),
        resume: 'file-9',
        onId: saved.add,
      );
      expect(id, 'file-1');
      expect(saved, ['file-1']);
    });

    test('the server does not offer parts: the OS transfer', () async {
      final inner = apiAdapter.handler;
      apiAdapter.handler = (o) async {
        if (o.path.endsWith('/multipart')) {
          return jsonBody(
            {
              'error': {'code': 'FEATURE_DISABLED', 'message': 'off'},
            },
            403,
          );
        }
        return inner(o);
      };
      await send(_big(dir, 20 * mib));
      expect(os.targets, hasLength(1));
      expect(storage.requests, isEmpty);
    });

    test('the user cancels: an error, no hand-over', () async {
      final cancel = CancelToken();
      storage.handler = (o) async {
        cancel.cancel('discarded');
        await Future<void>.delayed(const Duration(milliseconds: 5));
        return ResponseBody.fromString('', 200);
      };
      await expectLater(
        send(_big(dir, 20 * mib), cancel: cancel),
        throwsA(isA<DioException>()),
      );
      expect(os.targets, isEmpty);
    });
  });
}
