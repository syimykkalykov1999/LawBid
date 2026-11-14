import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/uploads/queued_photos.dart';
import 'package:lawbid/core/uploads/upload_files_memory.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';

/// Media audit 13.11 (C6): a 9-photo post goes 3-4 at a time, in order,
/// each finished id saved at once, a failure retried for that photo only.
Future<(UploadJob, MemoryUploadFiles)> _job(int n, {List<String?>? ids}) async {
  final files = MemoryUploadFiles();
  for (var i = 0; i < n; i++) {
    await files.keep(
      QueuedPhotos.nameOf('job', i),
      bytes: Uint8List.fromList([i]),
    );
  }
  final job = UploadJob(
    id: 'job',
    ownerId: 'me',
    kind: 'post',
    target: 'post:x',
    createdAt: DateTime(2026, 11, 13),
    payload: {
      'photos': [
        for (var i = 0; i < n; i++)
          if (ids != null && ids[i] != null)
            {'id': ids[i]}
          else
            {'file': QueuedPhotos.nameOf('job', i)},
      ],
    },
  );
  return (job, files);
}

void main() {
  test('photos go [parallel] at a time and the ids keep the photo order',
      () async {
    final (job, files) = await _job(9);
    var active = 0;
    var peak = 0;
    final saves = <List<Object?>>[];
    final ids = await QueuedPhotos.sendWith(
      job,
      (p) async => saves.add(List.of(p['ids']! as List)),
      files,
      (bytes, i) async {
        active++;
        peak = peak < active ? active : peak;
        // Later photos finish first: the order must still be the photos'.
        await Future<void>.delayed(Duration(milliseconds: 40 - i * 4));
        active--;
        return 'f${bytes.single}';
      },
      parallel: 4,
    );
    expect(ids, [for (var i = 0; i < 9; i++) 'f$i']);
    expect(peak, 4);
    expect(saves, hasLength(9), reason: 'each id saved as it lands');
    expect(saves.last, [for (var i = 0; i < 9; i++) 'f$i']);
  });

  test('one at a time with parallel 1 (the old behaviour)', () async {
    final (job, files) = await _job(3);
    var active = 0;
    var peak = 0;
    await QueuedPhotos.sendWith(
      job,
      (_) async {},
      files,
      (b, i) async {
        active++;
        peak = peak < active ? active : peak;
        await Future<void>.delayed(const Duration(milliseconds: 5));
        active--;
        return 'f$i';
      },
      parallel: 1,
    );
    expect(peak, 1);
  });

  test('a failure keeps what landed; the retry sends only the missing photo',
      () async {
    final (job, files) = await _job(4);
    var saved = <String, Object?>{};
    await expectLater(
      QueuedPhotos.sendWith(
        job,
        (p) async => saved = p,
        files,
        (b, i) async {
          if (i == 2) throw StateError('network');
          return 'f$i';
        },
        parallel: 4,
      ),
      throwsStateError,
    );
    final kept = saved['ids']! as List;
    expect(kept, ['f0', 'f1', null, 'f3']);

    final retried = UploadJob(
      id: job.id,
      ownerId: job.ownerId,
      kind: job.kind,
      target: job.target,
      createdAt: job.createdAt,
      payload: job.payload,
      progress: saved,
    );
    final sent = <int>[];
    final ids = await QueuedPhotos.sendWith(
      retried,
      (_) async {},
      files,
      (b, i) async {
        sent.add(i);
        return 'f$i';
      },
      parallel: 4,
    );
    expect(sent, [2]);
    expect(ids, ['f0', 'f1', 'f2', 'f3']);
  });

  test('photos the form already uploaded are not sent again', () async {
    final (job, files) = await _job(3, ids: ['a', null, 'c']);
    final sent = <int>[];
    final ids =
        await QueuedPhotos.sendWith(job, (_) async {}, files, (b, i) async {
      sent.add(i);
      return 'f$i';
    });
    expect(sent, [1]);
    expect(ids, ['a', 'f1', 'c']);
  });
}
