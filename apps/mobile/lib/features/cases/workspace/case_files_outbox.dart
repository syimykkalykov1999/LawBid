import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/idempotency_interceptor.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/core/uploads/queue_refused_notice.dart';
import 'package:lawbid/core/uploads/queued_photos.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/features/cases/workspace/workspace_data.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// The queue kind of a case update with files (core/uploads/upload_queue.dart).
const kCaseFilesJobKind = 'case.files';

/// The admin-free ceiling of one case file (the server checks the real one).
const _caseFileMaxBytes = 50 * 1024 * 1024;

/// Owner 2026-11-08 (instant everywhere, decision: the app's own queue): a
/// case update with photos or documents is queued; the compose sheet is
/// already gone, the files go up in the background (also after the app was
/// closed) and the update is written once they are in. There is no
/// «sending» element on a case: the update appears when written.
class CaseFilesOutbox {
  CaseFilesOutbox(this._ref, this._queue);

  final Ref _ref;
  final UploadQueue _queue;

  Future<void> submit(
    String caseId,
    String body,
    List<PickedCaseFile> files,
  ) async {
    final id = generateIdempotencyKey();
    final entries = await QueuedPhotos.keep(
      _ref.read(uploadFilesProvider),
      id,
      [for (final f in files) (fileId: null, bytes: f.bytes, upload: null)],
    );
    await _queue.enqueue(
      id: id,
      kind: kCaseFilesJobKind,
      target: 'case:$caseId',
      payload: {
        'caseId': caseId,
        'body': body,
        'files': [
          for (final f in files)
            {
              'name': f.name,
              'description': f.description,
              'sample': f.sample,
            },
        ],
        'photos': entries,
      },
    );
  }
}

class CaseFilesHandler extends UploadJobHandler {
  CaseFilesHandler(this._ref);

  final Ref _ref;

  @override
  String get kind => kCaseFilesJobKind;

  List<Map<String, Object?>> _files(UploadJob job) => [
        for (final f in (job.payload['files'] as List? ?? const []))
          (f as Map).cast<String, Object?>(),
      ];

  @override
  Future<void> prepare(UploadJob job, UploadJobScope scope) async {
    final files = _files(job);
    await QueuedPhotos.send(
      job,
      scope,
      _ref.read(uploadFilesProvider),
      (bytes, i) => _ref.read(socialRepositoryProvider).uploadPostPhoto(
            bytes,
            casePhoto: true,
            fileName: i < files.length ? files[i]['name'] as String? : null,
            maxBytes: _caseFileMaxBytes,
          ),
    );
  }

  @override
  Future<void> commit(UploadJob job, UploadJobScope scope) async {
    final caseId = job.payload['caseId']! as String;
    final files = _files(job);
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
  Future<void> removed(UploadJob job, {required bool sent}) =>
      QueuedPhotos.removeFiles(_ref.read(uploadFilesProvider), job);
}

/// The case-files outbox on the app's queue (read at start by the shell, so
/// an update left by the last run goes on).
final caseFilesOutboxProvider = Provider<CaseFilesOutbox>((ref) {
  final queue = ref.watch(uploadQueueProvider)
    ..register(CaseFilesHandler(ref));
  unawaited(showRefusedAtStart(ref, queue, kCaseFilesJobKind));
  return CaseFilesOutbox(ref, queue);
});
