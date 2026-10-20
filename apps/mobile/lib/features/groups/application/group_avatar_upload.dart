import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/data/avatar_upload_repository.dart';

enum GroupAvatarStage { idle, uploading, done, failed }

@immutable
class GroupAvatarState {
  const GroupAvatarState({
    this.stage = GroupAvatarStage.idle,
    this.progress = 0,
    this.preview,
    this.fileId,
    this.error,
  });

  final GroupAvatarStage stage;

  /// 0..1 of the storage upload.
  final double progress;

  /// The picked photo, shown while and after it is uploaded.
  final Uint8List? preview;

  /// The clean file to send as `CreateGroupDto.avatarFileId`.
  final String? fileId;
  final Object? error;

  bool get busy => stage == GroupAvatarStage.uploading;
}

ApiException _local(String code) => ApiException(code: code, message: code);

/// Uploads the photo of a new group with the profile-photo pipeline
/// (purpose `avatar`: presign, storage POST, confirm, wait for the scan)
/// but without attaching it to my account; the result is `fileId`.
class GroupAvatarUpload extends Notifier<GroupAvatarState> {
  UploadCancellation? _cancellation;
  Uint8List? _bytes;

  @override
  GroupAvatarState build() {
    ref.onDispose(() => _cancellation?.cancel());
    return const GroupAvatarState();
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

  /// Forget the photo.
  void clear() {
    if (state.busy) return;
    _bytes = null;
    state = const GroupAvatarState();
  }

  Future<void> _run() async {
    final bytes = _bytes!;
    final repo = ref.read(avatarUploadRepositoryProvider);
    final cancellation = _cancellation = UploadCancellation();
    state = GroupAvatarState(stage: GroupAvatarStage.uploading, preview: bytes);
    try {
      final mime = sniffImageMime(bytes);
      final limits = ref.read(uploadLimitsProvider)[UploadPlace.avatar];
      if (mime == null || !limits.photoMimes.contains(mime)) {
        throw _local(ApiErrorCodes.fileTypeNotAllowed);
      }
      if (bytes.length > limits.fileBytes) {
        throw _local(ApiErrorCodes.fileTooLarge);
      }
      final target = await repo.presign(
        mime: mime,
        sizeBytes: bytes.length,
        sha256: sha256Hex(bytes),
      );
      await repo.upload(
        target,
        bytes,
        mime,
        onProgress: (p) {
          if (ref.mounted) {
            state = GroupAvatarState(
              stage: GroupAvatarStage.uploading,
              progress: p,
              preview: bytes,
            );
          }
        },
        cancellation: cancellation,
      );
      var outcome = await repo.confirm(target.fileId);
      for (var i = 0; outcome == ScanOutcome.pending && i < 30; i++) {
        await Future<void>.delayed(const Duration(seconds: 1));
        if (cancellation.isCancelled || !ref.mounted) return;
        outcome = await repo.scanStatus(target.fileId);
      }
      if (cancellation.isCancelled || !ref.mounted) return;
      if (outcome != ScanOutcome.clean) {
        throw _local(ApiErrorCodes.fileNotAttachable);
      }
      state = GroupAvatarState(
        stage: GroupAvatarStage.done,
        progress: 1,
        preview: bytes,
        fileId: target.fileId,
      );
    } on UploadCancelledException {
      return;
    } on Object catch (e) {
      if (ref.mounted && !cancellation.isCancelled) {
        state = GroupAvatarState(
          stage: GroupAvatarStage.failed,
          preview: bytes,
          error: e,
        );
      }
    }
  }
}

final groupAvatarUploadProvider =
    NotifierProvider.autoDispose<GroupAvatarUpload, GroupAvatarState>(
  GroupAvatarUpload.new,
);
