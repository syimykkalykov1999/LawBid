import 'dart:async';
import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/uploads/upload_files_io.dart';
import 'package:lawbid/core/uploads/upload_leave_guard.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/core/uploads/upload_queue_database.dart';

import '../../helpers/upload_queue_overrides.dart';

/// A handler whose upload waits for the test.
class _SlowHandler extends UploadJobHandler {
  final gate = Completer<void>();

  @override
  String get kind => 'test';

  @override
  Future<void> prepare(UploadJob job, UploadJobScope scope) async {
    if (job.fileId != null) return;
    await gate.future;
    await scope.saveFileId('file-${job.id}');
  }

  @override
  Future<void> commit(UploadJob job, UploadJobScope scope) async {}
}

/// B-c2 (a), 2026-11-09: a browser tab has no background transfer, so
/// closing or reloading it while a file goes up stops the upload (the queue
/// continues it on the next visit). Like Google Drive, YouTube Studio and
/// Telegram Web, the site asks «Leave site?» while something is being sent,
/// and never otherwise.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late UploadQueueDatabase db;
  late Directory dir;
  late IoUploadFiles files;

  setUp(() async {
    db = UploadQueueDatabase(NativeDatabase.memory());
    dir = await Directory.systemTemp.createTemp('leave');
    files = IoUploadFiles(root: () async => dir);
  });

  tearDown(() async {
    await db.close();
    await dir.delete(recursive: true);
  });

  test('the queue says it is sending only while an upload runs', () async {
    final h = _SlowHandler();
    final q = UploadQueue(
      db: db,
      files: files,
      uploader: FakeStorageUploader(),
      ownerId: () => 'me',
      observeLifecycle: false,
    )..register(h);
    addTearDown(q.dispose);
    expect(q.sending.value, isFalse);

    await files.keep('a.bin', bytes: Uint8List.fromList([1, 2, 3]));
    unawaited(
      q.enqueue(id: 'a', kind: 'test', target: 'c1', fileName: 'a.bin'),
    );
    await pumpEventQueue();
    expect(q.sending.value, isTrue);

    h.gate.complete();
    await q.drain();
    await pumpEventQueue();
    expect(q.sending.value, isFalse);
    expect(await db.pending('me'), isEmpty);
  });

  test('the leave prompt follows the queue, and stops with it', () {
    final busy = ValueNotifier(false);
    final guard = UploadLeaveGuard(sending: busy);
    expect(guard.shouldWarn, isFalse);
    busy.value = true;
    expect(guard.shouldWarn, isTrue);
    guard.dispose();
    // A disposed guard (the account changed) never holds the tab.
    expect(guard.shouldWarn, isFalse);
  });
}
