import 'dart:typed_data';

import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/uploads/upload_files.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';

/// A photo of something published through the queue (a post, a review): its
/// file id when the form already has it, else its bytes (kept in the queue
/// folder) and the form's upload still running, if any (awaited instead of
/// sending the bytes twice).
typedef PendingPhoto = ({
  String? fileId,
  Uint8List? bytes,
  Future<String>? upload,
});

/// Owner 2026-11-08 (instant publish, the app's own queue): the photo steps
/// shared by the queued post and review. The job's payload keeps a list of
/// `{id}` / `{file}` entries; [send] fills in the ids one by one, saving each,
/// so a restart never uploads a photo twice.
abstract final class QueuedPhotos {
  /// The form's uploads still running, by job id and photo index (this run
  /// only; after a restart the kept bytes are sent).
  static final _running = <String, Map<int, Future<String>>>{};

  /// Keeps the bytes of the photos without an id under `<jobId>.p<i>` (and
  /// the first photo always, for a card after a restart when [keepFirst]),
  /// remembers the running uploads, and returns the payload entries.
  static Future<List<Map<String, Object?>>> keep(
    UploadFiles files,
    String jobId,
    List<PendingPhoto> photos, {
    Uint8List? first,
    bool keepFirst = false,
  }) async {
    _running[jobId] = {
      for (var i = 0; i < photos.length; i++)
        if (photos[i].fileId == null && photos[i].upload != null)
          i: photos[i].upload!,
    };
    final entries = <Map<String, Object?>>[];
    for (var i = 0; i < photos.length; i++) {
      final p = photos[i];
      final bytes = p.bytes ?? (i == 0 ? first : null);
      if (bytes != null && (p.fileId == null || (keepFirst && i == 0))) {
        await files.keep(nameOf(jobId, i), bytes: bytes);
      }
      entries.add({
        if (p.fileId != null) 'id': p.fileId,
        if (p.fileId == null) 'file': nameOf(jobId, i),
      });
    }
    return entries;
  }

  static String nameOf(String jobId, int i) => '$jobId.p$i';

  static List<Map<String, Object?>> entriesOf(UploadJob job) => [
        for (final p in (job.payload['photos'] as List? ?? const []))
          (p as Map).cast<String, Object?>(),
      ];

  /// The ids known so far (saved progress first, then the payload's).
  static List<String?> idsOf(UploadJob job) {
    final saved = job.progress['ids'] as List?;
    final photos = entriesOf(job);
    return [
      for (var i = 0; i < photos.length; i++)
        (saved != null && i < saved.length ? saved[i] as String? : null) ??
            photos[i]['id'] as String?,
    ];
  }

  /// Uploads what is missing (waiting for the form's own upload first) and
  /// returns every id, in order.
  static Future<List<String>> send(
    UploadJob job,
    UploadJobScope scope,
    UploadFiles files,
    Future<String> Function(Uint8List bytes, int index) upload,
  ) async {
    final photos = entriesOf(job);
    final ids = idsOf(job);
    for (var i = 0; i < photos.length; i++) {
      if (ids[i] != null) continue;
      String? id;
      final running = _running[job.id]?.remove(i);
      if (running != null) {
        try {
          id = await running;
        } on Object {
          id = null; // the kept bytes go below
        }
      }
      if (id == null) {
        final name = photos[i]['file'] as String?;
        final bytes = name == null ? null : await files.read(name);
        if (bytes == null) {
          throw const ApiException(
            code: UploadQueue.localFileMissing,
            message: 'photo',
          );
        }
        id = await upload(bytes, i);
      }
      ids[i] = id;
      await scope.saveProgress({'ids': ids});
    }
    return [for (final id in ids) id!];
  }

  /// The job left the queue: its kept photos go too.
  static Future<void> removeFiles(UploadFiles files, UploadJob job) async {
    _running.remove(job.id);
    for (var i = 0; i < entriesOf(job).length; i++) {
      await files.remove(nameOf(job.id, i));
    }
  }
}
