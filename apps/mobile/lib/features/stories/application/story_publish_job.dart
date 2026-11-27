import 'dart:math' as math;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show Uint8List, visibleForTesting;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/diagnostics/perf_marks.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/media/video_compression.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/stories/application/stories_providers.dart';
import 'package:lawbid/features/stories/data/stories_repository.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';

/// Where the publishing of a story is.
enum StoryPublishPhase {
  idle,
  compressing,
  uploading,
  processing,
  posting,
  done,
  failed,
}

class StoryPublishState {
  const StoryPublishState({
    this.phase = StoryPublishPhase.idle,
    this.progress = 0,
    this.error,
  });

  final StoryPublishPhase phase;

  /// 0..1 of the current phase (compressing, uploading).
  final double progress;
  final Object? error;

  bool get busy =>
      phase == StoryPublishPhase.compressing ||
      phase == StoryPublishPhase.uploading ||
      phase == StoryPublishPhase.processing ||
      phase == StoryPublishPhase.posting;
}

/// Owner 26.11 (Instagram «upload while you edit», as R-396 does for reels):
/// the picked photo uploads, and the picked video compresses and uploads,
/// while the story is still being edited. «Share» then only waits for what
/// is left. Nothing of it shows in the tray before «Share»; a replaced or
/// dropped pick cancels it (the server's orphan cleanup and Bunny's own
/// sweep remove what had already gone up).
class _Early {
  _Early.photo(Uint8List this.photo) : video = null;
  _Early.video(XFile this.video) : photo = null;

  final Uint8List? photo;
  final XFile? video;
  final cancel = CancelToken();
  VideoCompressor? compressor;

  /// The photo's upload.
  Future<String>? fileId;

  /// The video's compression, then its Bunny upload with the trim it was
  /// made with (the server cuts by it).
  Future<XFile>? compressed;
  Future<StoryUpload>? uploaded;
  int? uploadTrimMs;
  String? assetId;

  /// The bytes are in storage already.
  bool done = false;

  /// The latest step, and who hears the next ones once «Share» took over.
  StoryPublishPhase phase = StoryPublishPhase.compressing;
  double progress = 0;
  void Function(StoryPublishPhase phase, double progress)? onStep;

  void step(StoryPublishPhase p, double v) {
    phase = p;
    progress = v;
    onStep?.call(p, v);
  }
}

/// Owner 2026-10-20: a story is compressed, uploaded and posted by this job,
/// not by the creator screen — the screen can be left at any time, the tray
/// shows the progress (and a failure with "Try again").
class StoryPublishJob extends Notifier<StoryPublishState> {
  CancelToken? _cancel;
  VideoCompressor? _compressor;
  StoryDraft? _last;
  int _run = 0;

  /// The work started at the pick (see [_Early]); one at a time.
  _Early? _early;

  /// The pick's work taken over by the running [start].
  _Early? _claimed;

  /// Whether the picked media was already in storage at the last «Share»
  /// (tests; the timing mark says the same in debug builds).
  @visibleForTesting
  bool? lastShareHadMedia;

  @override
  StoryPublishState build() => const StoryPublishState();

  /// The picked photo starts uploading now (owner 26.11).
  void preparePhoto(Uint8List bytes, {String? name}) {
    discardPrepared();
    final e = _early = _Early.photo(bytes)..phase = StoryPublishPhase.uploading;
    // A failure is handled at «Share» (it uploads again then).
    e.fileId = ref
        .read(socialActionsProvider)
        .uploadPhoto(
          bytes,
          fileName: name,
          onProgress: (v) => e.step(StoryPublishPhase.uploading, v),
        )
        .then((id) {
      e.done = true;
      return id;
    })
      ..ignore();
  }

  /// The picked video starts compressing, then uploading with the trim
  /// [trimStartMs] (owner 26.11).
  void prepareVideo(
    XFile video, {
    required int durationMs,
    ({int width, int height})? size,
    int trimStartMs = 0,
  }) {
    discardPrepared();
    final e = _early = _Early.video(video);
    final draft = StoryDraft(
      kind: StoryKind.video,
      audience: StoryAudience.all,
      video: video,
      videoDurationMs: durationMs,
      videoSize: size,
      trimStartMs: trimStartMs,
    );
    final compressed = e.compressed = _compressed(
      draft,
      (p) => e.step(StoryPublishPhase.compressing, p),
      (c) => e.compressor = c,
    );
    final uploaded = e.uploaded = compressed.then((file) {
      if (e.cancel.isCancelled) {
        throw DioException.requestCancelled(
          requestOptions: RequestOptions(),
          reason: 'dropped',
        );
      }
      e
        ..uploadTrimMs = trimStartMs
        ..step(StoryPublishPhase.uploading, 0);
      return _uploadVideo(
        draft,
        file,
        e.cancel,
        (u) {
          e.assetId = u.videoAssetId;
          // Dropped while the slot was being made: it goes at once.
          if (e.cancel.isCancelled) _cancelAsset(u.videoAssetId);
        },
        (v) => e.step(StoryPublishPhase.uploading, v),
      );
    }).then((u) {
      e.done = true;
      return u;
    });
    compressed.ignore();
    uploaded.ignore();
  }

  /// The pick was replaced or dropped, or the creator closed without
  /// «Share».
  void discardPrepared() {
    final e = _early;
    _early = null;
    if (e != null) _drop(e);
  }

  void _drop(_Early e) {
    e.onStep = null;
    e.cancel.cancel();
    e.compressor?.cancel().ignore();
    final asset = e.assetId;
    if (asset != null) _cancelAsset(asset);
  }

  void _cancelAsset(String id) =>
      ref.read(storiesRepositoryProvider).cancelVideo(id).ignore();

  /// The pick's work when [draft] is made of the same media; any other is
  /// dropped.
  _Early? _take(StoryDraft draft) {
    final e = _early;
    if (e == null) return null;
    _early = null;
    final same = switch (draft.kind) {
      StoryKind.photo => identical(e.photo, draft.photo),
      StoryKind.video => identical(e.video, draft.video),
      StoryKind.text => false,
    };
    if (same) return e;
    _drop(e);
    return null;
  }

  /// Bunny's upload slot for [draft]'s trim, then the bytes of [file].
  Future<StoryUpload> _uploadVideo(
    StoryDraft draft,
    XFile file,
    CancelToken cancel,
    void Function(StoryUpload u) created,
    void Function(double v) onProgress,
  ) async {
    final repo = ref.read(storiesRepositoryProvider);
    final maxSec = ref.read(storyMaxVideoSecProvider);
    final start = draft.trimStartMs;
    final end = math.min(start + maxSec * 1000, draft.videoDurationMs);
    final upload = await repo.createVideoUpload(
      sizeBytes: await file.length(),
      durationSec: math.max(1, (draft.videoDurationMs / 1000).ceil()),
      trimStartMs: start,
      trimEndMs: math.max(end, start + 1),
    );
    created(upload);
    await repo.upload(
      file,
      upload,
      cancel: cancel,
      parallel: ref
          .read(featureFlagsControllerProvider)
          .isEnabled('reels_tus_parallel'),
      onProgress: onProgress,
    );
    return upload;
  }

  Future<void> start(StoryDraft draft) async {
    if (state.busy) return;
    _last = draft;
    final run = ++_run;
    final early = _claimed = _take(draft);
    _cancel = early?.cancel ?? CancelToken();
    final ready = draft.kind == StoryKind.text || (early?.done ?? false);
    lastShareHadMedia = ready;
    PerfMarks.publishTap('story', mediaReady: ready);
    String? assetId;
    bool alive() => ref.mounted && run == _run;
    void set(StoryPublishState s) {
      if (alive()) state = s;
    }

    void step(StoryPublishPhase p, double v) =>
        set(StoryPublishState(phase: p, progress: v));

    try {
      final repo = ref.read(storiesRepositoryProvider);
      String? fileId;
      String? videoAssetId;
      switch (draft.kind) {
        case StoryKind.photo:
          step(StoryPublishPhase.uploading, early?.progress ?? 0);
          if (early?.fileId case final going?) {
            early!.onStep = step;
            try {
              fileId = await going;
            } on Object {
              fileId = null; // uploaded again below
            }
            if (!alive()) return;
          }
          fileId ??= await ref.read(socialActionsProvider).uploadPhoto(
                draft.photo!,
                fileName: draft.photoName,
                onProgress: (v) => step(StoryPublishPhase.uploading, v),
              );
        case StoryKind.video:
          StoryUpload? upload;
          if (early != null) {
            step(early.phase, early.progress);
            early.onStep = step;
            final trim = early.uploadTrimMs;
            if (trim == null || trim == draft.trimStartMs) {
              try {
                upload = await early.uploaded;
              } on DioException catch (e) {
                if (CancelToken.isCancel(e)) rethrow;
                upload = null; // sent again below
              } on Object {
                upload = null;
              }
              if (!alive()) return;
            }
            if (upload != null && early.uploadTrimMs != draft.trimStartMs) {
              // The trim moved while it uploaded: Bunny cuts by the slot's
              // trim, so a new slot is made (the compressed file is kept).
              _cancelAsset(upload.videoAssetId);
              upload = null;
            } else if (upload == null) {
              // Its upload stops (the compression it made is kept).
              early.cancel.cancel();
              _cancel = CancelToken();
              if (early.assetId case final id?) _cancelAsset(id);
            }
          }
          if (upload == null) {
            step(StoryPublishPhase.compressing, 0);
            XFile? video;
            if (early?.compressed case final going?) {
              try {
                video = await going;
              } on Object {
                video = null;
              }
              if (!alive()) return;
            }
            video ??= await _compressed(
              draft,
              (p) => step(StoryPublishPhase.compressing, p),
              (c) => _compressor = c,
            );
            if (!alive()) return;
            step(StoryPublishPhase.uploading, 0);
            upload = await _uploadVideo(
              draft,
              video,
              _cancel!,
              (u) => assetId = u.videoAssetId,
              (v) => step(StoryPublishPhase.uploading, v),
            );
          }
          assetId = upload.videoAssetId;
          set(const StoryPublishState(phase: StoryPublishPhase.processing));
          await _waitReady(repo.videoStatus, upload.videoAssetId, alive);
          videoAssetId = upload.videoAssetId;
        case StoryKind.text:
          break;
      }
      if (!alive()) return;
      set(
        const StoryPublishState(phase: StoryPublishPhase.posting, progress: 1),
      );
      await repo.create(
        kind: draft.kind,
        audience: draft.audience,
        fileId: fileId,
        videoAssetId: videoAssetId,
        text: draft.text,
        background: draft.kind == StoryKind.text ? draft.background : null,
        overlays: draft.overlays,
      );
      if (!alive()) return;
      ref.invalidate(storyTrayProvider);
      final me = ref.read(currentUserIdProvider);
      if (me != null) ref.invalidate(userStoriesProvider(me));
      set(const StoryPublishState(phase: StoryPublishPhase.done, progress: 1));
    } on Object catch (e) {
      final asset = assetId;
      if (asset != null) _cancelAsset(asset);
      if (e is DioException && CancelToken.isCancel(e)) {
        set(const StoryPublishState());
      } else {
        set(StoryPublishState(phase: StoryPublishPhase.failed, error: e));
      }
    } finally {
      early?.onStep = null;
      if (identical(_claimed, early)) _claimed = null;
    }
  }

  /// Polls the upload until Bunny has encoded it (every 2 s, 5 minutes).
  Future<void> _waitReady(
    Future<String> Function(String id) status,
    String id,
    bool Function() alive,
  ) async {
    final until = DateTime.now().add(const Duration(minutes: 5));
    while (alive()) {
      String s;
      try {
        s = await status(id);
      } on ApiException catch (e) {
        if (e.code != ApiException.networkErrorCode) rethrow;
        s = 'processing';
      }
      if (s == 'ready') return;
      if (s == 'failed' || s == 'rejected' || s == 'deleted') {
        throw const ApiException(
          code: 'VIDEO_PROCESSING_FAILED',
          message: 'video processing failed',
        );
      }
      if (DateTime.now().isAfter(until)) {
        throw const ApiException(
          code: 'VIDEO_PROCESSING_FAILED',
          message: 'video processing timed out',
        );
      }
      await Future<void>.delayed(const Duration(seconds: 2));
    }
  }

  /// Up to the admin's height first (a smaller upload), in the browser too
  /// (owner 2026-11-08: WebCodecs, the original when it cannot).
  Future<XFile> _compressed(
    StoryDraft d,
    void Function(double progress) onProgress,
    void Function(VideoCompressor c) running,
  ) async {
    final file = d.video!;
    final size = d.videoSize;
    final flags = ref.read(featureFlagsControllerProvider);
    final limits = videoLimitsOf(flags);
    final need = size != null &&
        needsVideoCompression(
          shortSide: math.min(size.width, size.height),
          bytes: await file.length(),
          durationMs: d.videoDurationMs,
          limits: limits,
          reencodeAboveKbps: videoReencodeAboveKbpsOf(flags),
          oneEncode: bunnyOneEncodeOf(flags),
          maxBytes: videoMaxBytesOf(flags),
        );
    if (!need) return file;
    final compressor = ref.read(videoCompressorProvider);
    running(compressor);
    final out = await compressor.compress(
      file,
      limits: limits,
      onProgress: onProgress,
    );
    return out ?? file;
  }

  void cancel() {
    _run++;
    _cancel?.cancel();
    _compressor?.cancel().ignore();
    final claimed = _claimed;
    _claimed = null;
    if (claimed != null) _drop(claimed);
    state = const StoryPublishState();
  }

  /// Try again after a failure.
  Future<void> retry() async {
    final d = _last;
    if (d != null && state.phase == StoryPublishPhase.failed) await start(d);
  }

  void dismiss() => state = const StoryPublishState();
}

final storyPublishJobProvider =
    NotifierProvider<StoryPublishJob, StoryPublishState>(StoryPublishJob.new);
