import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/data/avatar_upload_repository.dart';

enum AvatarUploadStage { idle, preparing, uploading, checking, done, failed }

@immutable
class AvatarUploadState {
  const AvatarUploadState({
    this.stage = AvatarUploadStage.idle,
    this.progress = 0,
    this.preview,
    this.error,
  });

  final AvatarUploadStage stage;

  /// 0..1 of the storage upload.
  final double progress;

  /// The picked image, shown in the avatar while it uploads.
  final Uint8List? preview;
  final Object? error;

  bool get busy =>
      stage == AvatarUploadStage.preparing ||
      stage == AvatarUploadStage.uploading ||
      stage == AvatarUploadStage.checking;
}

/// Local, pre-network rejection (wrong type / too large) — surfaced with
/// the same localized texts as the server codes.
ApiException _local(String code) => ApiException(code: code, message: code);

/// Profile photo upload (docs/03 §4.1, stage 3.2 pipeline, OQ-012): pick →
/// presign → POST to storage with progress → confirm → wait for the scan →
/// attach to the account. [retry] repeats the whole pipeline with the same
/// bytes (a new presign, since links expire after 5 minutes).
class AvatarUploadController extends Notifier<AvatarUploadState> {
  Uint8List? _bytes;

  /// The in-flight pipeline's cancel handle; cancelled when the provider
  /// is disposed (screen left), which aborts the storage POST and stops
  /// the scan poll.
  UploadCancellation? _cancellation;

  /// Poll cadence / limit while the antivirus scan is pending.
  static const pollInterval = Duration(seconds: 1);
  static const maxPolls = 30;

  @override
  AvatarUploadState build() {
    ref.onDispose(() => _cancellation?.cancel());
    return const AvatarUploadState();
  }

  Future<void> start(Uint8List bytes) async {
    if (state.busy) return;
    _bytes = bytes;
    await _run();
  }

  Future<void> retry() async {
    if (state.busy || _bytes == null) return;
    await _run();
  }

  Future<void> _run() async {
    final bytes = _bytes!;
    final repo = ref.read(avatarUploadRepositoryProvider);
    final cancellation = _cancellation = UploadCancellation();
    state =
        AvatarUploadState(stage: AvatarUploadStage.preparing, preview: bytes);
    try {
      final mime = sniffImageMime(bytes);
      if (mime == null) throw _local(ApiErrorCodes.fileTypeNotAllowed);
      if (bytes.length > kAvatarMaxBytes)
        throw _local(ApiErrorCodes.fileTooLarge);
      final target = await repo.presign(
        mime: mime,
        sizeBytes: bytes.length,
        sha256: sha256Hex(bytes),
      );
      _set(AvatarUploadStage.uploading, 0);
      await repo.upload(
        target,
        bytes,
        mime,
        onProgress: (p) => _set(AvatarUploadStage.uploading, p),
        cancellation: cancellation,
      );
      if (cancellation.isCancelled) return;
      _set(AvatarUploadStage.checking, 1);
      var outcome = await repo.confirm(target.fileId);
      for (var i = 0; outcome == ScanOutcome.pending && i < maxPolls; i++) {
        await Future<void>.delayed(pollInterval);
        if (cancellation.isCancelled || !ref.mounted) return;
        outcome = await repo.scanStatus(target.fileId);
      }
      if (cancellation.isCancelled) return;
      if (outcome != ScanOutcome.clean)
        throw _local(ApiErrorCodes.fileNotAttachable);
      final me = await repo.attach(target.fileId);
      if (!ref.mounted) return;
      ref.read(currentUserControllerProvider.notifier).apply(me);
      state = AvatarUploadState(
          stage: AvatarUploadStage.done, progress: 1, preview: bytes);
    } on UploadCancelledException {
      return;
    } catch (e) {
      if (ref.mounted && !cancellation.isCancelled) {
        state = AvatarUploadState(
            stage: AvatarUploadStage.failed, preview: bytes, error: e);
      }
    } finally {
      if (identical(_cancellation, cancellation)) _cancellation = null;
    }
  }

  void _set(AvatarUploadStage stage, double progress) {
    if (!ref.mounted) return;
    state = AvatarUploadState(
        stage: stage, progress: progress, preview: state.preview);
  }
}

final avatarUploadControllerProvider =
    NotifierProvider.autoDispose<AvatarUploadController, AvatarUploadState>(
  AvatarUploadController.new,
);
