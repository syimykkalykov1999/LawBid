import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:flutter/material.dart' show Size;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/media/data_saver.dart';
import 'package:lawbid/core/media/video_compression.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/idempotency_interceptor.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/core/uploads/upload_queue_database.dart';
import 'package:lawbid/features/reels/application/reels_providers.dart';
import 'package:lawbid/features/reels/data/reels_repository.dart';
import 'package:lawbid/features/reels/domain/reel_cut.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';

/// Owner 2026-10-15: publishing a reel no longer holds the screen — the
/// form closes at once, the video is compressed, uploaded and posted by
/// this job in the background (the card at the top of the feed shows it).
/// Owner 2026-10-19 («шкала — обманка»): after the upload the video is
/// still being processed (Bunny); [processing] says so honestly and the
/// strip turns «Published» only when the reel can really be watched.
enum ReelPublishPhase {
  idle,
  compressing,
  uploading,
  posting,
  processing,
  done,
  failed,
}

/// Owner 2026-10-19: the reel the viewer just published, once it is ready —
/// the Reels tab puts it right after the reel on screen, the feed and the
/// profile show it at once.
final freshOwnReelProvider =
    NotifierProvider<FreshOwnReel, Post?>(FreshOwnReel.new);

class FreshOwnReel extends Notifier<Post?> {
  @override
  Post? build() => null;

  // ignore: use_setters_to_change_properties
  void announce(Post p) => state = p;
}

class ReelPublishState {
  const ReelPublishState({
    this.phase = ReelPublishPhase.idle,
    this.progress = 0,
    this.error,
    this.uploadFrom = 0,
  });

  final ReelPublishPhase phase;

  /// 0…1 within the current phase.
  final double progress;
  final Object? error;

  /// Owner 2026-10-22 (Instagram, one line for the whole publish): where
  /// the upload starts on the line — after the compression's share when the
  /// phone compressed the video, else from the very start.
  final double uploadFrom;

  /// The share of the compression on the line.
  static const compressShare = 0.3;

  /// 0…1 of the whole publish (compression, then the upload); 1 after.
  double get overall => switch (phase) {
        ReelPublishPhase.compressing => progress * compressShare,
        ReelPublishPhase.uploading => uploadFrom + progress * (1 - uploadFrom),
        ReelPublishPhase.idle || ReelPublishPhase.failed => 0,
        _ => 1,
      };

  bool get busy =>
      phase == ReelPublishPhase.compressing ||
      phase == ReelPublishPhase.uploading ||
      phase == ReelPublishPhase.posting ||
      phase == ReelPublishPhase.processing;
}

/// Everything the job needs, captured when «Publish» is pressed.
class ReelPublishRequest {
  const ReelPublishRequest({
    required this.file,
    required this.cut,
    required this.previewSize,
    required this.title,
    required this.text,
    required this.place,
    required this.commentsEnabled,
    required this.photoIds,
    required this.attachments,
    this.coverFileId,
    this.cover,
  });

  final XFile file;
  final ReelCut cut;
  final Size previewSize;
  final String title;
  final String text;
  final String place;
  final bool commentsEnabled;
  final List<String> photoIds;
  final List<PostDocumentRef> attachments;

  /// A cover picked from the gallery (an uploaded post image), if any.
  final String? coverFileId;

  /// Owner 2026-10-22 (Instagram): the cover the form showed — the publish
  /// card's thumbnail from the first moment.
  final Uint8List? cover;
}

/// The queue kind and target of a reel being published.
const kReelJobKind = 'reel';
const _kReelTarget = 'reels';

/// R-396: the payload mark of a draft — the video picked on the form,
/// uploading ahead; its post waits for «Publish»
/// ([ReelPublishJob.publishDraft]).
const kReelDraftKey = 'draft';

bool _isDraft(Map<String, Object?> payload) => payload[kReelDraftKey] == true;

/// Owner 2026-10-22 (product audit #4 §3, Instagram): a reel being published
/// is a job of the persistent upload queue (core/uploads) — the video is
/// copied into the queue's folder and every step is saved as it finishes
/// (the compressed file, Bunny's upload, the TUS address to resume from),
/// so closing or killing the app no longer loses the upload: the next start
/// continues from the last byte Bunny has. A dropped connection is retried
/// on its own; only a refusal shows «Retry».
class ReelPublishJob extends Notifier<ReelPublishState> {
  CancelToken? _cancel;
  VideoCompressor? _compressor;
  ReelPublishRequest? _last;
  String? _jobId;
  Uint8List? _cover;

  @override
  ReelPublishState build() {
    final queue = ref.watch(uploadQueueProvider)
      ..register(ReelUploadHandler(ref, this));
    // A reel left by the last run (closed mid-upload) shows its card again
    // while the queue continues it.
    final owner = queue.ownerId;
    if (owner != null) {
      unawaited(
        queue.db
            .ofKind(owner, kReelJobKind)
            .then((rows) => _onJobs(queue, rows), onError: (_) {}),
      );
    }
    return const ReelPublishState();
  }

  /// The reel being published (or the failed one «Retry» sends again).
  ReelPublishRequest? get request => _last;

  /// The cover the card shows (also after a restart, from the queue).
  Uint8List? get cover => _cover ?? _last?.cover;

  /// The job found at start: a refused one shows «Retry», a waiting one
  /// shows the card while the queue continues it.
  Future<void> _onJobs(UploadQueue queue, List<UploadJobRow> all) async {
    // R-396: a draft left by the last run belonged to a form that is gone:
    // it is dropped (its Bunny upload too), never posted.
    final rows = <UploadJobRow>[];
    for (final r in all) {
      if (_isDraft(UploadJob.fromRow(r).payload)) {
        unawaited(queue.discard(r.id));
      } else {
        rows.add(r);
      }
    }
    if (!ref.mounted || rows.isEmpty) return;
    final row = rows.first;
    _jobId = row.id;
    _cover ??= await ref.read(uploadFilesProvider).read('${row.id}.cover');
    if (!ref.mounted || state.phase != ReelPublishPhase.idle) return;
    state = row.failedCode != null
        ? ReelPublishState(
            phase: ReelPublishPhase.failed,
            error: ApiException(code: row.failedCode!, message: 'reel'),
          )
        : const ReelPublishState(phase: ReelPublishPhase.uploading);
  }

  /// The queue refused the reel for good: «Retry» / «×».
  void refused(String code) => report(
        ReelPublishState(
          phase: ReelPublishPhase.failed,
          error: ApiException(code: code, message: 'reel'),
        ),
      );

  /// Used by [ReelUploadHandler] while the job runs.
  void report(ReelPublishState next) {
    if (ref.mounted) state = next;
  }

  /// The progress of job [id]: kept aside while it is a draft (no card yet),
  /// dropped for a discarded draft, else shown on the card.
  void reportFor(String id, ReelPublishState next) {
    if (id == _draftId) {
      _draftState = next;
    } else if (!_dropped.contains(id)) {
      report(next);
    }
  }

  /// Job [id] was refused for good (see [reportFor]).
  void refusedFor(String id, String code) => reportFor(
        id,
        ReelPublishState(
          phase: ReelPublishPhase.failed,
          error: ApiException(code: code, message: 'reel'),
        ),
      );

  CancelToken get cancelToken => _cancel ??= CancelToken();

  /// Up to the admin's height on the phone first (smaller upload).
  Future<XFile?> compressIfNeeded(
    XFile file, {
    required Size previewSize,
    required ReelCut cut,
    String? jobId,
  }) async {
    // Owner 2026-11-08: the browser re-encodes too (WebCodecs), or keeps the
    // original when it cannot.
    final limits = videoLimitsOf(ref.read(featureFlagsControllerProvider));
    final need = needsVideoCompression(
      shortSide: math.min(previewSize.width, previewSize.height).round(),
      bytes: await file.length(),
      durationMs: cut.totalMs,
      limits: limits,
    );
    if (!need) return null;
    final compressor = ref.read(videoCompressorProvider);
    _compressor = compressor;
    return compressor.compress(
      file,
      limits: limits,
      onProgress: (p) {
        final next =
            ReelPublishState(phase: ReelPublishPhase.compressing, progress: p);
        jobId == null ? report(next) : reportFor(jobId, next);
      },
    );
  }

  /// Reels asked for while another one publishes: they go one after the
  /// other (audit C4) instead of being dropped.
  final _queued = <ReelPublishRequest>[];

  void _startNext() {
    if (!ref.mounted || state.busy || _queued.isEmpty) return;
    unawaited(start(_queued.removeAt(0)));
  }

  Future<void> start(ReelPublishRequest r) async {
    if (state.busy) {
      _queued.add(r);
      return;
    }
    final queue = ref.read(uploadQueueProvider);
    _last = r;
    _cover = r.cover;
    _cancel = CancelToken();
    state = const ReelPublishState(phase: ReelPublishPhase.compressing);
    final id = generateIdempotencyKey();
    _jobId = id;
    try {
      final files = ref.read(uploadFilesProvider);
      final name = await files.keep('$id.mp4', fromPath: r.file.path);
      if (r.cover != null) await files.keep('$id.cover', bytes: r.cover);
      await queue.enqueue(
        id: id,
        kind: kReelJobKind,
        target: _kReelTarget,
        payload: reelRequestJson(r),
        fileName: name,
        mime: 'video/mp4',
      );
    } on Object catch (e) {
      state = ReelPublishState(phase: ReelPublishPhase.failed, error: e);
    }
  }

  /// R-396 (owner 2026-11-04, «в Инсте не так»): like Instagram, the video
  /// starts compressing and uploading the moment it is picked; «Publish»
  /// then only adds the caption. The draft is a held job of the upload
  /// queue (same steps as [ReelUploadHandler.prepare]); its post waits.
  String? _draftId;
  Future<void>? _draftSaved;
  ReelPublishState _draftState = const ReelPublishState();
  final _dropped = <String>{};

  /// The draft running now (tests).
  @visibleForTesting
  String? get draftId => _draftId;

  /// Starts uploading a picked video ahead; its id, or null when it does
  /// not start (another reel is publishing, the data saver is on, signed
  /// out) — then «Publish» uploads it as before. One draft at a time: a
  /// newer one replaces the older.
  String? startDraft({
    required XFile file,
    required ReelCut cut,
    required Size previewSize,
    String? coverFileId,
  }) {
    if (!ref.mounted || state.busy || _queued.isNotEmpty) return null;
    if (ref.read(dataSaverProvider)) return null;
    final queue = ref.read(uploadQueueProvider);
    if (queue.ownerId == null) return null;
    final old = _draftId;
    if (old != null) discardDraft(old);
    final id = generateIdempotencyKey();
    _draftId = id;
    _draftState = const ReelPublishState(phase: ReelPublishPhase.compressing);
    final r = ReelPublishRequest(
      file: file,
      cut: cut,
      previewSize: previewSize,
      coverFileId: coverFileId,
      title: '',
      text: '',
      place: '',
      commentsEnabled: true,
      photoIds: const [],
      attachments: const [],
    );
    _draftSaved = _saveDraft(queue, id, r);
    return id;
  }

  Future<void> _saveDraft(
    UploadQueue queue,
    String id,
    ReelPublishRequest r,
  ) async {
    final files = ref.read(uploadFilesProvider);
    try {
      final name = await files.keep('$id.mp4', fromPath: r.file.path);
      if (_dropped.contains(id)) {
        // Removed while it was copied: nothing goes to the server.
        await files.remove(name);
        return;
      }
      await queue.enqueue(
        id: id,
        kind: kReelJobKind,
        target: _kReelTarget,
        payload: {...reelRequestJson(r), kReelDraftKey: true},
        fileName: name,
        mime: 'video/mp4',
      );
    } on Object catch (e) {
      if (_draftId == id) {
        _draftState =
            ReelPublishState(phase: ReelPublishPhase.failed, error: e);
      }
    }
  }

  /// «Publish» on a form whose video went ahead as draft [id]: the caption
  /// goes into the job and its post is created as soon as the upload is
  /// done (at once when it already is); the card picks up the progress
  /// where the draft is. A draft that cannot be used (failed, replaced,
  /// another reel publishing) is dropped and the reel goes as before.
  Future<void> publishDraft(String id, ReelPublishRequest r) async {
    final saved = _draftSaved;
    final shown = _draftState;
    if (_draftId != id ||
        state.busy ||
        saved == null ||
        shown.phase == ReelPublishPhase.failed) {
      discardDraft(id);
      return start(r);
    }
    _draftId = null;
    _draftSaved = null;
    _draftState = const ReelPublishState();
    _last = r;
    _cover = r.cover;
    _cancel = CancelToken();
    _jobId = id;
    state = shown.phase == ReelPublishPhase.idle
        ? const ReelPublishState(phase: ReelPublishPhase.compressing)
        : shown;
    try {
      await saved;
      if (r.cover != null) {
        await ref.read(uploadFilesProvider).keep('$id.cover', bytes: r.cover);
      }
      final released =
          await ref.read(uploadQueueProvider).release(id, reelRequestJson(r));
      if (released) return;
      // The draft never reached the queue: the reel goes as before.
      _jobId = null;
      state = const ReelPublishState();
      await start(r);
    } on Object catch (e) {
      state = ReelPublishState(phase: ReelPublishPhase.failed, error: e);
    }
  }

  /// The video was removed or replaced, or the form closed unpublished:
  /// the draft stops, its file goes and its Bunny upload is deleted
  /// (`DELETE /videos/:id`, in [ReelUploadHandler.removed]).
  void discardDraft(String id) {
    if (_draftId != id) return;
    final saved = _draftSaved;
    final compressing = _draftState.phase == ReelPublishPhase.compressing;
    _draftId = null;
    _draftSaved = null;
    _draftState = const ReelPublishState();
    _dropped.add(id);
    if (compressing) _compressor?.cancel().ignore();
    final queue = ref.read(uploadQueueProvider);
    unawaited(() async {
      try {
        await saved;
      } on Object {
        // Nothing was queued.
      }
      await queue.discard(id);
    }());
  }

  /// After the post exists: «The video is processing…» until it plays.
  Future<void> posted(Post created) async {
    state = const ReelPublishState(phase: ReelPublishPhase.processing);
    try {
      final ready =
          await _waitReady(ref.read(socialRepositoryProvider), created);
      if (ready == null) return; // cancelled / replaced
      _announce(ready);
      state = const ReelPublishState(phase: ReelPublishPhase.done, progress: 1);
      _startNext();
    } on Object catch (e) {
      state = ReelPublishState(phase: ReelPublishPhase.failed, error: e);
    }
  }

  /// Polls the new post until its video is ready (or failed): every 3 s,
  /// for at most 20 minutes. Null when another publish took over.
  Future<Post?> _waitReady(SocialRepository social, Post created) async {
    var post = created;
    final until = DateTime.now().add(const Duration(minutes: 20));
    while (post.video != null && !post.video!.ready) {
      // Prod 2026-11-09: `rejected` (too long / too large) is final too;
      // before, it spun «processing» until the 20-minute limit.
      final status = post.video!.status;
      if (status == 'failed' || status == 'rejected') {
        throw StateError('video processing failed');
      }
      if (DateTime.now().isAfter(until)) {
        throw StateError('video processing timed out');
      }
      await Future<void>.delayed(const Duration(seconds: 3));
      if (state.phase != ReelPublishPhase.processing) return null;
      try {
        post = await social.post(created.id);
      } on Object {
        // A network blip: try again on the next tick.
      }
    }
    return post;
  }

  /// The ready reel shows at once: first in the feed, in the own profile's
  /// Reels, and next in the Reels tab.
  void _announce(Post post) {
    try {
      ref.read(feedProvider.notifier).prepend(post);
    } on Object {
      // The feed is not loaded: it reads the reel when it opens.
    }
    final me = ref.read(currentUserIdProvider);
    if (me != null) {
      // The own profile's grids and post counter follow (audit C6).
      ref.invalidate(attorneyReelsProvider(me));
      refreshProfileCounters(ref);
    }
    ref.read(freshOwnReelProvider.notifier).announce(post);
  }

  void cancel() {
    _cancel?.cancel();
    _cancel = null;
    _compressor?.cancel().ignore();
    final id = _jobId;
    _jobId = null;
    if (id != null) unawaited(ref.read(uploadQueueProvider).discard(id));
    state = const ReelPublishState();
    _startNext();
  }

  /// Try again after a failure.
  Future<void> retry() async {
    final id = _jobId;
    if (id != null) {
      _cancel = CancelToken();
      state = const ReelPublishState(phase: ReelPublishPhase.uploading);
      await ref.read(uploadQueueProvider).retry(id);
      return;
    }
    final r = _last;
    if (r != null) await start(r);
  }

  /// «×» on a failed card: the reel is put away (its job and file go).
  void dismiss() {
    final failed = state.phase == ReelPublishPhase.failed;
    final id = _jobId;
    if (failed && id != null) {
      _jobId = null;
      unawaited(ref.read(uploadQueueProvider).discard(id));
    }
    state = const ReelPublishState();
    _startNext();
  }
}

/// What a queued reel needs (JSON in the job).
Map<String, Object?> reelRequestJson(ReelPublishRequest r) => {
      'title': r.title,
      'text': r.text,
      'place': r.place,
      'commentsEnabled': r.commentsEnabled,
      'photoIds': r.photoIds,
      'attachments': [
        for (final a in r.attachments)
          {'fileId': a.fileId, 'fileName': a.fileName},
      ],
      if (r.coverFileId != null) 'coverFileId': r.coverFileId,
      'cut': {
        'totalMs': r.cut.totalMs,
        'startMs': r.cut.startMs,
        'endMs': r.cut.endMs,
        'coverMs': r.cut.coverMs,
      },
      'preview': {'w': r.previewSize.width, 'h': r.previewSize.height},
    };

/// Runs a queued reel: [prepare] compresses, asks Bunny for an upload and
/// sends the video (resumable); [commit] creates the post (keyed by the job
/// id, so a repeat never makes a second post). Each finished step is saved
/// in the job, so a restart continues where it stopped.
class ReelUploadHandler extends UploadJobHandler {
  ReelUploadHandler(this._ref, this._job);

  final Ref _ref;

  /// The publish card's state (the notifier that registered this handler).
  final ReelPublishJob _job;

  @override
  String get kind => kReelJobKind;

  /// R-396: a draft uploads, but its post waits for «Publish».
  @override
  bool holds(UploadJob job) => _isDraft(job.payload);

  @override
  Future<void> prepare(UploadJob job, UploadJobScope scope) async {
    final p = job.progress;
    if (p['uploaded'] == true) return;
    // Cancelled when the job is discarded (a removed draft, «×»): no
    // further step reaches the server.
    final cancel = scope.cancelToken;
    final repo = _ref.read(reelsRepositoryProvider);
    final files = _ref.read(uploadFilesProvider);
    final payload = job.payload;
    final cutJson = (payload['cut'] as Map?)?.cast<String, Object?>() ?? {};
    int n(String k) => (cutJson[k] as num?)?.toInt() ?? 0;
    final cut = ReelCut(
      totalMs: n('totalMs'),
      startMs: n('startMs'),
      endMs: n('endMs'),
      coverMs: n('coverMs'),
    );
    final preview = (payload['preview'] as Map?)?.cast<String, Object?>() ?? {};

    // 1. The video to send: the compressed copy once made.
    var name = p['video'] as String? ?? job.fileName;
    var path = name == null ? null : await files.pathOf(name);
    if (p['video'] == null && path != null) {
      _job.reportFor(
        job.id,
        const ReelPublishState(phase: ReelPublishPhase.compressing),
      );
      final out = await _job.compressIfNeeded(
        XFile(path),
        previewSize: Size(
          (preview['w'] as num?)?.toDouble() ?? 0,
          (preview['h'] as num?)?.toDouble() ?? 0,
        ),
        cut: cut,
        jobId: job.id,
      );
      if (cancel.isCancelled) return;
      if (out != null) {
        name =
            await files.keep('${job.id}.c.mp4', fromPath: out.path, move: true);
        path = await files.pathOf(name);
        await files.remove(job.fileName!);
      }
      await scope.saveProgress({'video': name});
    }
    final XFile video;
    if (path != null) {
      video = XFile(path);
    } else {
      final bytes = name == null ? null : await files.read(name);
      if (bytes == null) {
        throw const ApiException(
          code: UploadQueue.localFileMissing,
          message: 'reel',
        );
      }
      video = XFile.fromData(bytes, mimeType: 'video/mp4');
    }
    // The upload's share of the line starts after the compression's.
    final from = name != job.fileName ? ReelPublishState.compressShare : 0.0;
    _job.reportFor(
      job.id,
      ReelPublishState(phase: ReelPublishPhase.uploading, uploadFrom: from),
    );
    if (cancel.isCancelled) return;

    // 2. Bunny's upload slot (kept: a restart reuses it).
    var upload = _uploadOf(p);
    if (upload == null) {
      final made = await repo.createUpload(
        sizeBytes: await video.length(),
        durationSec: cut.sourceSec,
        title: (payload['title'] as String? ?? '').isEmpty
            ? null
            : payload['title'] as String?,
        trimStartMs: cut.trimmed ? cut.startMs : null,
        trimEndMs: cut.trimmed ? cut.endMs : null,
        coverTimeMs: cut.coverMs,
        coverFileId: payload['coverFileId'] as String?,
      );
      if (cancel.isCancelled) {
        // Discarded while Bunny's slot was made: it goes too.
        repo.cancel(made.videoAssetId).ignore();
        return;
      }
      upload = made;
      await scope.saveProgress({
        'assetId': made.videoAssetId,
        'tusEndpoint': made.tusEndpoint,
        'libraryId': made.libraryId,
        'videoId': made.videoId,
        'signature': made.signature,
        'expire': made.expire,
        'maxDurationSec': made.maxDurationSec,
      });
    }

    // 3. The bytes, resumable from the saved TUS address.
    await repo.upload(
      video,
      upload,
      cancel: cancel,
      resumeLocation: p['location'] as String?,
      onLocation: (l) => unawaited(scope.saveProgress({'location': l})),
      parallel: _ref
          .read(featureFlagsControllerProvider)
          .isEnabled('reels_tus_parallel'),
      resumePartLocations: (p['partLocations'] as List<Object?>?)?.cast(),
      onPartLocations: (l) =>
          unawaited(scope.saveProgress({'partLocations': l})),
      onProgress: (v) => _job.reportFor(
        job.id,
        ReelPublishState(
          phase: ReelPublishPhase.uploading,
          progress: v,
          uploadFrom: from,
        ),
      ),
    );
    await scope.saveProgress({'uploaded': true});
  }

  static ReelUpload? _uploadOf(Map<String, Object?> p) {
    final id = p['assetId'] as String?;
    if (id == null) return null;
    return ReelUpload(
      videoAssetId: id,
      tusEndpoint: p['tusEndpoint']! as String,
      libraryId: p['libraryId']! as String,
      videoId: p['videoId']! as String,
      signature: p['signature']! as String,
      expire: (p['expire']! as num).toInt(),
      maxDurationSec: (p['maxDurationSec'] as num?)?.toInt() ?? 0,
    );
  }

  @override
  Future<void> commit(UploadJob job, UploadJobScope scope) async {
    final payload = job.payload;
    _job.reportFor(
      job.id,
      const ReelPublishState(phase: ReelPublishPhase.posting, progress: 1),
    );
    final created = await _ref.read(socialRepositoryProvider).createPost(
          PostDraft(
            // Owner 2026-10-18: the title and the description as typed —
            // both optional, a reel's video is enough.
            title: payload['title'] as String? ?? '',
            body: payload['text'] as String? ?? '',
            videoAssetId: job.progress['assetId']! as String,
            mediaFileIds: [
              for (final id in (payload['photoIds'] as List?) ?? const [])
                id as String,
            ],
            attachments: [
              for (final a in (payload['attachments'] as List?) ?? const [])
                PostDocumentRef(
                  fileId: (a as Map)['fileId'] as String,
                  fileName: a['fileName'] as String,
                ),
            ],
            locationName: (payload['place'] as String? ?? '').isEmpty
                ? null
                : payload['place'] as String?,
            commentsEnabled: payload['commentsEnabled'] as bool? ?? true,
            idempotencyKey: job.id,
          ),
        );
    // «Published» only once the video plays (Bunny encodes it meanwhile).
    unawaited(_job.posted(created));
  }

  @override
  void refused(UploadJob job, String code) => _job.refusedFor(job.id, code);

  @override
  Future<void> removed(UploadJob job, {required bool sent}) async {
    final files = _ref.read(uploadFilesProvider);
    await files.remove('${job.id}.cover');
    final video = job.progress['video'] as String?;
    if (video != null && video != job.fileName) await files.remove(video);
    final asset = job.progress['assetId'] as String?;
    if (!sent && asset != null) {
      _ref.read(reelsRepositoryProvider).cancel(asset).ignore();
    }
  }
}

final reelPublishJobProvider =
    NotifierProvider<ReelPublishJob, ReelPublishState>(ReelPublishJob.new);
