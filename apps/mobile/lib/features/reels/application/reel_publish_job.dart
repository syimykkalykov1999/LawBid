import 'dart:math' as math;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart' show Size;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/media/video_compression.dart';
import 'package:lawbid/features/reels/application/reels_providers.dart';
import 'package:lawbid/features/reels/domain/reel_cut.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_repository.dart';

/// Owner 2026-10-15: publishing a reel no longer holds the screen — the
/// form closes at once, the video is compressed, uploaded and posted by
/// this job in the background, with a thin progress strip over the app.
enum ReelPublishPhase { idle, compressing, uploading, posting, done, failed }

class ReelPublishState {
  const ReelPublishState({
    this.phase = ReelPublishPhase.idle,
    this.progress = 0,
    this.error,
  });

  final ReelPublishPhase phase;
  final double progress;
  final Object? error;

  bool get busy =>
      phase == ReelPublishPhase.compressing ||
      phase == ReelPublishPhase.uploading ||
      phase == ReelPublishPhase.posting;
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
}

class ReelPublishJob extends Notifier<ReelPublishState> {
  CancelToken? _cancel;
  VideoCompressor? _compressor;
  ReelPublishRequest? _last;

  @override
  ReelPublishState build() => const ReelPublishState();

  Future<void> start(ReelPublishRequest r) async {
    if (state.busy) return;
    _last = r;
    state = const ReelPublishState(phase: ReelPublishPhase.compressing);
    _cancel = CancelToken();
    final repo = ref.read(reelsRepositoryProvider);
    String? assetId;
    try {
      final video = await _compressed(r);
      if (_cancel?.isCancelled ?? true) return;
      state = const ReelPublishState(phase: ReelPublishPhase.uploading);
      final upload = await repo.createUpload(
        sizeBytes: await video.length(),
        durationSec: r.cut.sourceSec,
        title: r.title.isEmpty ? null : r.title,
        trimStartMs: r.cut.trimmed ? r.cut.startMs : null,
        trimEndMs: r.cut.trimmed ? r.cut.endMs : null,
        coverTimeMs: r.cut.coverMs,
        coverFileId: r.coverFileId,
      );
      assetId = upload.videoAssetId;
      await repo.upload(
        video,
        upload,
        cancel: _cancel,
        onProgress: (v) => state = ReelPublishState(
          phase: ReelPublishPhase.uploading,
          progress: v,
        ),
      );
      state = const ReelPublishState(
        phase: ReelPublishPhase.posting,
        progress: 1,
      );
      await ref.read(socialRepositoryProvider).createPost(
            PostDraft(
              title: r.title.isNotEmpty
                  ? r.title
                  : String.fromCharCodes(r.text.runes.take(60)),
              // The server needs a non-empty text; a reel without a caption
              // reuses its title.
              body: r.text.isNotEmpty ? r.text : r.title,
              videoAssetId: upload.videoAssetId,
              mediaFileIds: r.photoIds,
              attachments: r.attachments,
              locationName: r.place.isEmpty ? null : r.place,
              commentsEnabled: r.commentsEnabled,
            ),
          );
      state = const ReelPublishState(phase: ReelPublishPhase.done, progress: 1);
    } on Object catch (e) {
      if (assetId != null) repo.cancel(assetId).ignore();
      if (e is DioException && CancelToken.isCancel(e)) {
        state = const ReelPublishState();
      } else {
        state = ReelPublishState(phase: ReelPublishPhase.failed, error: e);
      }
    }
  }

  /// Up to the admin's height on the phone first (smaller upload).
  Future<XFile> _compressed(ReelPublishRequest r) async {
    if (kIsWeb) return r.file;
    final limits = videoLimitsOf(ref.read(featureFlagsControllerProvider));
    final need = needsVideoCompression(
      shortSide: math.min(r.previewSize.width, r.previewSize.height).round(),
      bytes: await r.file.length(),
      durationMs: r.cut.totalMs,
      limits: limits,
    );
    if (!need) return r.file;
    final compressor = ref.read(videoCompressorProvider);
    _compressor = compressor;
    final out = await compressor.compress(
      r.file,
      limits: limits,
      onProgress: (p) => state = ReelPublishState(
        phase: ReelPublishPhase.compressing,
        progress: p,
      ),
    );
    return out ?? r.file;
  }

  void cancel() {
    _cancel?.cancel();
    _compressor?.cancel().ignore();
    state = const ReelPublishState();
  }

  /// Try again after a failure.
  Future<void> retry() async {
    final r = _last;
    if (r != null) await start(r);
  }

  void dismiss() => state = const ReelPublishState();
}

final reelPublishJobProvider =
    NotifierProvider<ReelPublishJob, ReelPublishState>(ReelPublishJob.new);
