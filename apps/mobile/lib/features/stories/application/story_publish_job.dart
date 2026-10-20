import 'dart:math' as math;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/media/video_compression.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/stories/application/stories_providers.dart';
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

/// Owner 2026-10-20: a story is compressed, uploaded and posted by this job,
/// not by the creator screen — the screen can be left at any time, the tray
/// shows the progress (and a failure with "Try again").
class StoryPublishJob extends Notifier<StoryPublishState> {
  CancelToken? _cancel;
  VideoCompressor? _compressor;
  StoryDraft? _last;
  int _run = 0;

  @override
  StoryPublishState build() => const StoryPublishState();

  Future<void> start(StoryDraft draft) async {
    if (state.busy) return;
    _last = draft;
    final run = ++_run;
    _cancel = CancelToken();
    String? assetId;
    bool alive() => ref.mounted && run == _run;
    void set(StoryPublishState s) {
      if (alive()) state = s;
    }

    try {
      final repo = ref.read(storiesRepositoryProvider);
      String? fileId;
      String? videoAssetId;
      switch (draft.kind) {
        case StoryKind.photo:
          set(const StoryPublishState(phase: StoryPublishPhase.uploading));
          fileId = await ref.read(socialActionsProvider).uploadPhoto(
                draft.photo!,
                fileName: draft.photoName,
                onProgress: (v) => set(
                  StoryPublishState(
                    phase: StoryPublishPhase.uploading,
                    progress: v,
                  ),
                ),
              );
        case StoryKind.video:
          set(const StoryPublishState(phase: StoryPublishPhase.compressing));
          final video = await _compressed(draft, set, alive);
          if (!alive()) return;
          set(const StoryPublishState(phase: StoryPublishPhase.uploading));
          final maxSec = ref.read(storyMaxVideoSecProvider);
          final start = draft.trimStartMs;
          final end = math.min(start + maxSec * 1000, draft.videoDurationMs);
          final upload = await repo.createVideoUpload(
            sizeBytes: await video.length(),
            durationSec: math.max(1, (draft.videoDurationMs / 1000).ceil()),
            trimStartMs: start,
            trimEndMs: math.max(end, start + 1),
          );
          assetId = upload.videoAssetId;
          await repo.upload(
            video,
            upload,
            cancel: _cancel,
            onProgress: (v) => set(
              StoryPublishState(
                phase: StoryPublishPhase.uploading,
                progress: v,
              ),
            ),
          );
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
      if (assetId != null) {
        ref.read(storiesRepositoryProvider).cancelVideo(assetId).ignore();
      }
      if (e is DioException && CancelToken.isCancel(e)) {
        set(const StoryPublishState());
      } else {
        set(StoryPublishState(phase: StoryPublishPhase.failed, error: e));
      }
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

  /// Up to the admin's height first (a smaller upload); the browser build
  /// uploads the file as picked.
  Future<XFile> _compressed(
    StoryDraft d,
    void Function(StoryPublishState) set,
    bool Function() alive,
  ) async {
    final file = d.video!;
    if (kIsWeb) return file;
    final size = d.videoSize;
    final limits = videoLimitsOf(ref.read(featureFlagsControllerProvider));
    final need = size != null &&
        needsVideoCompression(
          shortSide: math.min(size.width, size.height),
          bytes: await file.length(),
          durationMs: d.videoDurationMs,
          limits: limits,
        );
    if (!need) return file;
    final compressor = ref.read(videoCompressorProvider);
    _compressor = compressor;
    final out = await compressor.compress(
      file,
      limits: limits,
      onProgress: (p) => set(
        StoryPublishState(phase: StoryPublishPhase.compressing, progress: p),
      ),
    );
    return out ?? file;
  }

  void cancel() {
    _run++;
    _cancel?.cancel();
    _compressor?.cancel().ignore();
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
