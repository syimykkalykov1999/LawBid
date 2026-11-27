import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/idempotency_interceptor.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/core/uploads/upload_queue_database.dart';
import 'package:lawbid/features/cases/workspace/case_files_outbox.dart';
import 'package:lawbid/features/cases/workspace/workspace_data.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/fake_http_adapter.dart';
import '../../helpers/upload_queue_overrides.dart';
import '../social/social_fakes.dart';

class _Files extends FakeSocialRepository {
  final sent = <String?>[];
  ApiException? failWith;

  @override
  Future<String> uploadPostPhoto(
    Uint8List bytes, {
    void Function(double progress)? onProgress,
    bool casePhoto = false,
    bool reviewPhoto = false,
    String? fileName,
    int? maxBytes,
    String? path,
  }) async {
    final e = failWith;
    if (e != null) throw e;
    sent.add(fileName);
    return 'file-${sent.length}';
  }
}

ProviderContainer _container(
  _Files files,
  FakeHttpAdapter api_, {
  UploadQueueDatabase? db,
  FakeStorageUploader? uploader,
}) {
  final dio = Dio(BaseOptions(baseUrl: 'https://api.test'))
    ..httpClientAdapter = api_
    ..interceptors.add(IdempotencyInterceptor());
  final c = ProviderContainer(
    overrides: [
      socialRepositoryProvider.overrideWithValue(files),
      caseWorkspaceClientProvider.overrideWithValue(api.CasesClient(dio)),
      ...uploadQueueOverrides(db: db, fixedOnline: true, uploader: uploader),
    ],
  );
  addTearDown(c.dispose);
  return c;
}

Future<void> _until(bool Function() done) async {
  for (var i = 0; i < 100 && !done(); i++) {
    await Future<void>.delayed(const Duration(milliseconds: 50));
  }
}

PickedCaseFile _file(String name) =>
    PickedCaseFile(bytes: Uint8List(8), name: name, description: 'note');

/// A JPEG's first bytes (the picker's photo, told by its bytes).
Uint8List _jpeg() => Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0]);

/// Owner 2026-11-08 (instant everywhere): a case update with files returns
/// as soon as it is queued; the files go up in the background, the update
/// is written once (Idempotency-Key = job id), and it survives the app
/// being closed. Case audit 26.11: the files go the 1:1 chat's way (the
/// queue's uploader, from disk), videos too, and the update shows while it
/// is sent.
void main() {
  test('queued at once; files go up, the update is written with its key',
      () async {
    final files = _Files();
    final storage = FakeStorageUploader();
    final updates = <RequestOptions>[];
    final adapter = FakeHttpAdapter((o) async {
      updates.add(o);
      return ok(<Object>[]);
    });
    final c = _container(files, adapter, uploader: storage);
    await c
        .read(caseWorkspaceActionsProvider)
        .addUpdate('case-1', 'Docs attached', [_file('a.pdf'), _file('b.jpg')]);
    await _until(() => updates.isNotEmpty);
    // KNOWN_ERRORS 235: the files go up in parallel — which one first is
    // not the contract, both are.
    expect(storage.uploads, hasLength(2));
    expect(files.sent, isEmpty, reason: 'the queue uploader, not the form');
    final post = updates.single;
    expect(post.path, contains('case-1'));
    expect(post.headers['Idempotency-Key'], isNotNull);
    final body = post.data as Map<String, dynamic>;
    expect((body['files'] as List).length, 2);
  });

  test('closing the app mid-way: written at the next start, exactly once',
      () async {
    final db = UploadQueueDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    final first = _Files();
    final down = FakeHttpAdapter(
      (o) async => jsonBody(
        {
          'error': {'code': 'INTERNAL', 'message': 'down'},
        },
        503,
      ),
    );
    final c1 = _container(first, down, db: db);
    await c1
        .read(caseWorkspaceActionsProvider)
        .addUpdate('case-1', 'Docs', [_file('a.pdf')]);
    await _until(() => down.requests.isNotEmpty);
    final key = down.requests.first.headers['Idempotency-Key'];
    c1.dispose(); // the app is closed

    final again = _Files();
    final storage = FakeStorageUploader();
    final updates = <RequestOptions>[];
    final up = FakeHttpAdapter((o) async {
      updates.add(o);
      return ok(<Object>[]);
    });
    final c2 = _container(again, up, db: db, uploader: storage)
      ..read(caseFilesOutboxProvider);
    await _until(() => updates.isNotEmpty);
    await Future<void>.delayed(const Duration(milliseconds: 150));
    expect(updates, hasLength(1));
    expect(updates.single.headers['Idempotency-Key'], key);
    expect(storage.uploads, isEmpty, reason: 'the stored file id is reused');
    expect(again.sent, isEmpty);
    c2.dispose();
  });

  test('a video on disk: copied to the queue, sent as a case attachment',
      () async {
    final dir = await Directory.systemTemp.createTemp('case-video');
    addTearDown(() => dir.delete(recursive: true));
    final video = File('${dir.path}/clip.mp4')
      ..writeAsBytesSync(List<int>.filled(4096, 7));
    final storage = FakeStorageUploader();
    final updates = <RequestOptions>[];
    final c = _container(
      _Files(),
      FakeHttpAdapter((o) async {
        updates.add(o);
        return ok(<Object>[]);
      }),
      uploader: storage,
    );
    await c.read(caseWorkspaceActionsProvider).addUpdate('case-1', 'Clip', [
      PickedCaseFile(
        bytes: Uint8List(0),
        name: 'video.mp4',
        path: video.path,
        diskBytes: 4096,
        mime: 'video/mp4',
        thumb: _jpeg(),
      ),
      PickedCaseFile(bytes: _jpeg(), name: 'p.jpg'),
    ]);
    await _until(() => updates.isNotEmpty);
    final byPurpose = {for (final u in storage.uploads) u.purpose: u};
    expect(byPurpose[api.FilePurpose.caseAttachment]?.size, 4096);
    expect(byPurpose[api.FilePurpose.casePhoto]?.size, 8);
    expect(
      storage.uploads.map((u) => u.taskId).toSet(),
      hasLength(2),
      reason: 'each file is its own transfer (resumable on its own)',
    );
    expect(video.existsSync(), isTrue, reason: 'the picked file is copied');
    expect(
      (updates.single.data as Map)['files'] as List,
      hasLength(2),
    );
  });

  test('a job queued before 26.11 (no types) still goes the old way', () async {
    final files = _Files();
    final storage = FakeStorageUploader();
    final updates = <RequestOptions>[];
    final c = _container(
      files,
      FakeHttpAdapter((o) async {
        updates.add(o);
        return ok(<Object>[]);
      }),
      uploader: storage,
    );
    final queue = (c..read(caseFilesOutboxProvider)).read(uploadQueueProvider);
    final store = c.read(uploadFilesProvider);
    await store.keep('old.p0', bytes: Uint8List(8));
    await queue.enqueue(
      id: 'old',
      kind: kCaseFilesJobKind,
      target: 'case:case-1',
      payload: {
        'caseId': 'case-1',
        'body': 'Old',
        'files': [
          {'name': 'a.pdf', 'description': '', 'sample': false},
        ],
        'photos': [
          {'file': 'old.p0'},
        ],
      },
    );
    await _until(() => updates.isNotEmpty);
    expect(files.sent, ['a.pdf']);
    expect(storage.uploads, isEmpty);
  });

  test('the update shows at once while it is sent, then goes', () async {
    final release = Completer<void>();
    final updates = <RequestOptions>[];
    final c = _container(
      _Files(),
      FakeHttpAdapter((o) async {
        await release.future;
        updates.add(o);
        return ok(<Object>[]);
      }),
    );
    final seen = <List<PendingCaseUpdate>>[];
    final sub = c.listen(
      casePendingUpdatesProvider('case-1'),
      (_, next) {
        if (next.value != null) seen.add(next.value!);
      },
      fireImmediately: true,
    );
    addTearDown(sub.close);
    await c.read(caseWorkspaceActionsProvider).addUpdate(
      'case-1',
      'Photo attached',
      [PickedCaseFile(bytes: _jpeg(), name: 'p.jpg')],
    );
    await _until(() => seen.isNotEmpty && seen.last.isNotEmpty);
    final p = seen.last.single;
    expect(p.body, 'Photo attached');
    expect(p.failed, isFalse);
    expect(p.previews.single, isNotNull, reason: 'the local picture');
    release.complete();
    await _until(() => updates.isNotEmpty && seen.last.isEmpty);
    expect(seen.last, isEmpty);
  });

  test('a refused file: the entry stays as «not sent», Retry sends it',
      () async {
    final storage = FakeStorageUploader()
      ..fail = const ApiException(
        code: ApiErrorCodes.fileTypeNotAllowed,
        message: 'type',
        statusCode: 400,
      );
    final updates = <RequestOptions>[];
    final c = _container(
      _Files(),
      FakeHttpAdapter((o) async {
        updates.add(o);
        return ok(<Object>[]);
      }),
      uploader: storage,
    );
    final sub = c.listen(casePendingUpdatesProvider('case-1'), (_, __) {});
    addTearDown(sub.close);
    await c
        .read(caseWorkspaceActionsProvider)
        .addUpdate('case-1', 'Docs', [_file('a.pdf')]);
    await _until(
      () =>
          c
              .read(casePendingUpdatesProvider('case-1'))
              .value
              ?.singleOrNull
              ?.failed ??
          false,
    );
    final p = c.read(casePendingUpdatesProvider('case-1')).value!.single;
    expect(p.failed, isTrue);
    expect(updates, isEmpty);
    storage.fail = null;
    await c.read(uploadQueueProvider).retry(p.id);
    await _until(() => updates.isNotEmpty);
    expect(updates, hasLength(1));
  });
}
