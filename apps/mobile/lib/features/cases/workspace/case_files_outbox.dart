import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/files/file_types.dart' show sniffImageMime;
import 'package:lawbid/core/files/upload_limits.dart' show uploadMimeForName;
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/idempotency_interceptor.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/core/uploads/queue_refused_notice.dart';
import 'package:lawbid/core/uploads/queued_photos.dart';
import 'package:lawbid/core/uploads/storage_uploader.dart';
import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid/core/uploads/upload_files.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/core/uploads/upload_queue_database.dart';
import 'package:lawbid/features/cases/workspace/workspace_data.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// The queue kind of a case update with files (core/uploads/upload_queue.dart).
const kCaseFilesJobKind = 'case.files';

/// The queue target of a case's updates.
String caseFilesTarget(String caseId) => 'case:$caseId';

/// The admin-free ceiling of one case file (the server checks the real one).
const _caseFileMaxBytes = 50 * 1024 * 1024;

/// The kept first frame of the video at [i] of job [jobId] (for the
/// «sending» entry after a restart).
String _thumbName(String jobId, int i) => '$jobId.t$i';

/// Owner 2026-11-08 (instant everywhere, decision: the app's own queue): a
/// case update with photos, videos or documents is queued; the compose
/// sheet is already gone, the files go up in the background (also after the
/// app was closed) and the update is written once they are in.
///
/// Case audit 26.11 (as the 1:1 chat's attachment job): a file picked on
/// disk is copied into the queue folder and streamed from there (never read
/// whole into memory); while it goes, the case's History shows the update
/// at once with its local pictures, a progress ring and Retry / Delete
/// ([casePendingUpdatesProvider]).
class CaseFilesOutbox {
  CaseFilesOutbox(this._ref, this._queue);

  final Ref _ref;
  final UploadQueue _queue;

  /// Local pictures of the jobs queued in this run (job id → one per file,
  /// null for a document), so the «sending» entry shows them without a read.
  static final previews = <String, List<Uint8List?>>{};

  Future<void> submit(
    String caseId,
    String body,
    List<PickedCaseFile> files,
  ) async {
    final id = generateIdempotencyKey();
    final store = _ref.read(uploadFilesProvider);
    previews[id] = [
      for (final f in files)
        if (f.isImage && f.path == null) f.bytes else f.thumb,
    ];
    final entries = <Map<String, Object?>>[];
    for (var i = 0; i < files.length; i++) {
      final f = files[i];
      final name = QueuedPhotos.nameOf(id, i);
      if (f.path != null) {
        await store.keep(name, fromPath: f.path);
      } else {
        await store.keep(name, bytes: f.bytes);
      }
      final thumb = f.thumb;
      if (thumb != null) await store.keep(_thumbName(id, i), bytes: thumb);
      entries.add({'file': name});
    }
    await _queue.enqueue(
      id: id,
      kind: kCaseFilesJobKind,
      target: caseFilesTarget(caseId),
      payload: {
        'caseId': caseId,
        'body': body,
        'files': [
          for (final f in files)
            {
              'name': f.name,
              'description': f.description,
              'sample': f.sample,
              'mime': f.mime ?? _mimeOf(f),
              'size': f.size,
              if (f.thumb != null) 'thumb': true,
            },
        ],
        'photos': entries,
      },
    );
  }

  static String? _mimeOf(PickedCaseFile f) =>
      f.path == null ? sniffImageMime(f.bytes) : null;
}

class CaseFilesHandler extends UploadJobHandler {
  CaseFilesHandler(this._ref);

  final Ref _ref;

  @override
  String get kind => kCaseFilesJobKind;

  static List<Map<String, Object?>> filesOf(UploadJob job) => [
        for (final f in (job.payload['files'] as List? ?? const []))
          (f as Map).cast<String, Object?>(),
      ];

  @override
  Future<void> prepare(UploadJob job, UploadJobScope scope) async {
    final files = filesOf(job);
    final store = _ref.read(uploadFilesProvider);
    // A job queued before 26.11 has no types: its photos and documents go
    // the way they went then (read, told by their first bytes).
    if (files.any((f) => !f.containsKey('mime'))) {
      await QueuedPhotos.send(
        job,
        scope,
        store,
        (bytes, i) => _ref.read(socialRepositoryProvider).uploadPostPhoto(
              bytes,
              casePhoto: true,
              fileName: i < files.length ? files[i]['name'] as String? : null,
              maxBytes: _caseFileMaxBytes,
            ),
      );
      return;
    }
    final sizes = [for (final f in files) (f['size'] as num?)?.toDouble() ?? 1];
    final total = sizes.fold<double>(0, (a, b) => a + b);
    final done = List<double>.filled(files.length, 0);
    void report(int i, double v) {
      done[i] = v.clamp(0, 1).toDouble();
      var sum = 0.0;
      for (var k = 0; k < done.length; k++) {
        sum += done[k] * sizes[k];
      }
      scope.reportProgress(total <= 0 ? 0 : sum / total);
    }

    for (final i in [
      for (final (k, id) in QueuedPhotos.idsOf(job).indexed)
        if (id != null) k,
    ]) {
      done[i] = 1;
    }
    // The files go in parallel; their resume points are saved one at a
    // time (each save merges into the job's progress).
    var saving = Future<void>.value();
    Future<void> save(Map<String, Object?> v) =>
        saving = saving.then((_) => scope.saveProgress(v));
    await QueuedPhotos.sendKept(
      job,
      scope,
      store,
      (name, i) => _uploadOne(
        job,
        scope,
        store,
        files[i],
        name,
        i,
        save,
        (v) => report(i, v),
      ),
    );
  }

  /// One file of the update, the way the 1:1 chat sends its attachment
  /// (`uploadChatAttachmentJob`): streamed from disk on the phone, parts in
  /// parallel on screen and the OS transfer in the background, the target
  /// and the parts saved so a restart resumes; a file already stored only
  /// waits for its scan. A case file is attached only once it is clean.
  Future<String> _uploadOne(
    UploadJob job,
    UploadJobScope scope,
    UploadFiles store,
    Map<String, Object?> file,
    String name,
    int i,
    Future<void> Function(Map<String, Object?>) save,
    void Function(double) onProgress,
  ) async {
    final storedKey = 'stored.$i';
    final stored = job.progress[storedKey] as String?;
    if (stored != null) {
      onProgress(1);
      try {
        return await scope.uploader.waitStored(stored);
      } on ApiException catch (e) {
        if (e.statusCode != 404 && e.code != ApiErrorCodes.notFound) rethrow;
        await save({storedKey: null});
      }
    }
    final path = await store.pathOf(name);
    final UploadBody body;
    if (path != null) {
      body = UploadBody.file(path);
    } else {
      final bytes = await store.read(name);
      if (bytes == null) {
        throw const ApiException(
          code: UploadQueue.localFileMissing,
          message: 'case file',
        );
      }
      body = UploadBody.bytes(bytes);
    }
    if (await body.length() > _caseFileMaxBytes) {
      throw const ApiException(
        code: ApiErrorCodes.fileTooLarge,
        message: 'size',
      );
    }
    final fileName = file['name'] as String? ?? 'file';
    final mime = file['mime'] as String? ??
        uploadMimeForName(fileName) ??
        'application/octet-stream';
    final image = mime.startsWith('image/');
    return scope.uploader.upload(
      purpose:
          image ? api.FilePurpose.casePhoto : api.FilePurpose.caseAttachment,
      body: body,
      mime: mime,
      filename: image ? 'photo.${mime.split('/').last}' : fileName,
      onProgress: onProgress,
      cancel: scope.cancelToken,
      taskId: '${job.id}.f$i',
      savedTarget: StorageTarget.fromJson(job.progress['target.$i']),
      onTarget: (t) => save({'target.$i': t.toJson()}),
      // R-251: parts already in storage are not sent again after a restart.
      resumeFileId: job.progress['parts.$i'] as String?,
      onPartsFileId: (id) => unawaited(save({'parts.$i': id})),
      onStored: (id) async {
        onProgress(1);
        await save({storedKey: id});
      },
    );
  }

  @override
  Future<void> commit(UploadJob job, UploadJobScope scope) async {
    final caseId = job.payload['caseId']! as String;
    final files = filesOf(job);
    final ids = QueuedPhotos.idsOf(job);
    await guardApiCall(
      () => _ref.read(caseWorkspaceClientProvider).addCaseUpdate(
        id: caseId,
        body: api.CreateCaseUpdateDto(
          body: job.payload['body'] as String? ?? '',
          files: [
            for (var i = 0; i < ids.length; i++)
              api.CaseFileInputDto(
                fileId: ids[i]!,
                description: _description(files, i),
                sample: i < files.length && files[i]['sample'] == true
                    ? true
                    : null,
              ),
          ],
        ),
        extras: {
          RequestFlags.createsResource: true,
          RequestFlags.idempotencyKey: job.id,
        },
      ),
    );
    _ref.read(caseWorkspaceActionsProvider).refresh(caseId);
  }

  static String? _description(List<Map<String, Object?>> files, int i) {
    final d = i < files.length ? (files[i]['description'] as String?) : null;
    return d == null || d.trim().isEmpty ? null : d;
  }

  @override
  void refused(UploadJob job, String code) =>
      showQueueRefused(_ref, _ref.read(uploadQueueProvider), job.id, code);

  @override
  Future<void> removed(UploadJob job, {required bool sent}) async {
    CaseFilesOutbox.previews.remove(job.id);
    final store = _ref.read(uploadFilesProvider);
    for (var i = 0; i < filesOf(job).length; i++) {
      await store.remove(_thumbName(job.id, i));
    }
    await QueuedPhotos.removeFiles(store, job);
  }
}

/// The case-files outbox on the app's queue (read at start by the shell, so
/// an update left by the last run goes on).
final caseFilesOutboxProvider = Provider<CaseFilesOutbox>((ref) {
  final queue = ref.watch(uploadQueueProvider)..register(CaseFilesHandler(ref));
  unawaited(showRefusedAtStart(ref, queue, kCaseFilesJobKind));
  return CaseFilesOutbox(ref, queue);
});

/// One update of a case still on its way (the queue's job), as the History
/// shows it: its text, its files with their local pictures, how far the
/// bytes are, and whether the server refused it.
class PendingCaseUpdate {
  const PendingCaseUpdate({
    required this.job,
    required this.body,
    required this.files,
    required this.previews,
  });

  final UploadJob job;
  final String body;
  final List<Map<String, Object?>> files;
  final List<Uint8List?> previews;

  String get id => job.id;
  bool get failed => job.failed;
}

/// Case audit 26.11 (Telegram / WhatsApp outgoing bubble: sending → sent):
/// the updates with files of a case still in the queue, oldest first.
final casePendingUpdatesProvider =
    StreamProvider.autoDispose.family<List<PendingCaseUpdate>, String>(
  (ref, caseId) {
    // Read so the handler is on the queue (the job goes on from here too).
    ref.watch(caseFilesOutboxProvider);
    final queue = ref.watch(uploadQueueProvider);
    final owner = queue.ownerId;
    if (owner == null) return Stream.value(const []);
    final store = ref.read(uploadFilesProvider);
    final read = <String, List<Uint8List?>>{};
    Future<List<Uint8List?>> previewsOf(UploadJob job) async {
      final known = CaseFilesOutbox.previews[job.id] ?? read[job.id];
      if (known != null) return known;
      // After a restart: a photo's own kept file (small), a video's frame.
      final files = CaseFilesHandler.filesOf(job);
      final out = <Uint8List?>[];
      for (var i = 0; i < files.length; i++) {
        final f = files[i];
        final mime = f['mime'] as String? ?? '';
        out.add(
          f['thumb'] == true
              ? await store.read(_thumbName(job.id, i))
              : mime.startsWith('image/') || !f.containsKey('mime')
                  ? await store.read(QueuedPhotos.nameOf(job.id, i))
                  : null,
        );
      }
      return read[job.id] = out;
    }

    return queue.db
        .watchTarget(
      owner,
      caseFilesTarget(caseId),
      kindPrefix: kCaseFilesJobKind,
    )
        .asyncMap((List<UploadJobRow> rows) async {
      final out = <PendingCaseUpdate>[];
      for (final r in rows) {
        final job = UploadJob.fromRow(r);
        out.add(
          PendingCaseUpdate(
            job: job,
            body: job.payload['body'] as String? ?? '',
            files: CaseFilesHandler.filesOf(job),
            previews: await previewsOf(job),
          ),
        );
      }
      read.removeWhere((k, _) => !rows.any((r) => r.id == k));
      return out;
    });
  },
);
