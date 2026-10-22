import 'dart:io';
import 'dart:typed_data';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/uploads/upload_files_io.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/core/uploads/upload_queue_database.dart';

import '../../helpers/upload_queue_overrides.dart';

/// A handler whose steps the test controls.
class _Handler extends UploadJobHandler {
  _Handler(this.kind);

  @override
  final String kind;

  final prepared = <String>[];
  final committed = <String>[];
  final refusals = <String>[];
  final removedIds = <(String, bool)>[];
  final delays = <String, Duration>{};
  Object? Function(UploadJob job)? prepareError;
  Object? Function(UploadJob job)? commitError;

  @override
  Future<void> prepare(UploadJob job, UploadJobScope scope) async {
    if (job.fileId != null) return;
    final d = delays[job.id];
    if (d != null) await Future<void>.delayed(d);
    final e = prepareError?.call(job);
    // ignore: only_throw_errors
    if (e != null) throw e;
    prepared.add(job.id);
    scope.reportProgress(1);
    await scope.saveFileId('file-${job.id}');
  }

  @override
  Future<void> commit(UploadJob job, UploadJobScope scope) async {
    final e = commitError?.call(job);
    // ignore: only_throw_errors
    if (e != null) throw e;
    expect(job.fileId, 'file-${job.id}');
    committed.add(job.id);
  }

  @override
  void refused(UploadJob job, String code) => refusals.add('${job.id}:$code');

  @override
  Future<void> removed(UploadJob job, {required bool sent}) async =>
      removedIds.add((job.id, sent));
}

const _offline =
    ApiException(code: ApiException.networkErrorCode, message: 'offline');
const _refused = ApiException(
  code: ApiErrorCodes.fileTooLarge,
  message: 'size',
  statusCode: 413,
);

/// Owner 2026-10-22 (audit #4 §3): the persistent upload queue — order per
/// target, temporary vs final failures, Retry / Delete, and a restart.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late UploadQueueDatabase db;
  late Directory dir;
  late IoUploadFiles files;

  setUp(() async {
    db = UploadQueueDatabase(NativeDatabase.memory());
    dir = await Directory.systemTemp.createTemp('queue');
    files = IoUploadFiles(root: () async => dir);
  });

  tearDown(() async {
    await db.close();
    await dir.delete(recursive: true);
  });

  UploadQueue queue(_Handler h) {
    final q = UploadQueue(
      db: db,
      files: files,
      uploader: FakeStorageUploader(),
      ownerId: () => 'me',
      observeLifecycle: false,
    )..register(h);
    addTearDown(q.dispose);
    return q;
  }

  Future<void> add(UploadQueue q, String id, {String target = 'c1'}) async {
    await files.keep('$id.bin', bytes: Uint8List.fromList([1, 2, 3]));
    await q.enqueue(
      id: id,
      kind: 'test',
      target: target,
      fileName: '$id.bin',
    );
  }

  test('one target sends oldest first, whatever upload ends first', () async {
    final h = _Handler('test')
      ..delays['a'] = const Duration(milliseconds: 60)
      ..delays['b'] = const Duration(milliseconds: 5);
    final q = queue(h);
    await add(q, 'a');
    await add(q, 'b');
    await add(q, 'c');
    await q.drain();
    expect(h.committed, ['a', 'b', 'c']);
    expect(await db.pending('me'), isEmpty);
    expect(dir.listSync(recursive: true).whereType<File>(), isEmpty);
    expect(h.removedIds, [('a', true), ('b', true), ('c', true)]);
  });

  test('offline holds the chat it belongs to, not the others', () async {
    final h = _Handler('test')
      ..prepareError = (j) => j.id == 'a' ? _offline : null;
    final q = queue(h);
    await add(q, 'a');
    await add(q, 'b');
    await add(q, 'x', target: 'c2');
    await q.drain();
    expect(h.committed, ['x']);
    final left = await db.pending('me');
    expect(left.map((r) => r.id), ['a', 'b']);
    // Still «sending»: not refused.
    expect(left.every((r) => r.failedCode == null), isTrue);

    // The network is back.
    h.prepareError = null;
    await q.drain();
    expect(h.committed, ['x', 'a', 'b']);
  });

  test('a refusal stays «not sent»; the next one goes; Retry sends it',
      () async {
    final h = _Handler('test')
      ..prepareError = (j) => j.id == 'a' ? _refused : null;
    final q = queue(h);
    await add(q, 'a');
    await add(q, 'b');
    await q.drain();
    expect(h.committed, ['b']);
    expect(h.refusals, ['a:${ApiErrorCodes.fileTooLarge}']);
    expect((await db.byId('a'))!.failedCode, ApiErrorCodes.fileTooLarge);

    h.prepareError = null;
    await q.retry('a');
    await q.drain();
    expect(h.committed, ['b', 'a']);
  });

  test('Delete removes the job and its file', () async {
    final h = _Handler('test')..prepareError = (_) => _refused;
    final q = queue(h);
    await add(q, 'a');
    await q.drain();
    await q.discard('a');
    expect(await db.pending('me'), isEmpty);
    expect(dir.listSync(recursive: true).whereType<File>(), isEmpty);
    expect(h.removedIds, [('a', false)]);
  });

  test('after a restart an uploaded file is not uploaded again', () async {
    final h1 = _Handler('test')..commitError = (_) => _offline;
    final first = queue(h1);
    await add(first, 'a');
    await first.drain();
    expect(h1.prepared, ['a']);
    first.dispose();

    // The next run: same database and folder, a new queue.
    final h2 = _Handler('test');
    final second = queue(h2);
    await second.drain();
    expect(h2.prepared, isEmpty);
    expect(h2.committed, ['a']);
  });

  test('jobs of another account are left alone', () async {
    final h = _Handler('test');
    final q = queue(h);
    await add(q, 'a');
    final other = UploadQueue(
      db: db,
      files: files,
      uploader: FakeStorageUploader(),
      ownerId: () => 'someone-else',
      observeLifecycle: false,
    )..register(_Handler('test'));
    addTearDown(other.dispose);
    await other.drain();
    expect(await db.pending('me'), isNotEmpty);
  });

  test('temporary failures are the network, 401, 408, 425, 429 and 5xx', () {
    expect(UploadQueue.temporary(_offline), isTrue);
    for (final c in [401, 408, 425, 429, 500, 503]) {
      expect(
        UploadQueue.temporary(
          ApiException(code: 'X', message: 'x', statusCode: c),
        ),
        isTrue,
        reason: '$c',
      );
    }
    expect(UploadQueue.temporary(_refused), isFalse);
    expect(UploadQueue.backoff(1), const Duration(seconds: 1));
    expect(UploadQueue.backoff(10), const Duration(seconds: 30));
  });

  test('progress is reported per job', () async {
    final h = _Handler('test');
    final q = queue(h);
    final seen = <UploadProgress>[];
    final sub = q.progress.listen(seen.add);
    addTearDown(sub.cancel);
    await add(q, 'a');
    await q.drain();
    await Future<void>.delayed(Duration.zero);
    expect(seen, [(id: 'a', value: 1.0)]);
  });
}
