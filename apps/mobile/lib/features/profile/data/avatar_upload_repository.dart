import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/uploads/storage_uploader.dart';
import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid/features/onboarding/data/current_user_mapper.dart';
import 'package:lawbid/features/onboarding/data/users_api_client.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/verification/domain/verification_repository.dart'
    show UploadCancellation, UploadCancelledException;
import 'package:lawbid_api/lawbid_api.dart' as api;

export 'package:lawbid/core/files/file_types.dart' show sniffImageMime;
export 'package:lawbid/features/verification/domain/verification_repository.dart'
    show UploadCancellation, UploadCancelledException;

/// A presigned S3 POST (`POST /files/presign`).
class PresignedUpload {
  const PresignedUpload({
    required this.fileId,
    required this.url,
    required this.fields,
  });
  final String fileId;
  final String url;
  final Map<String, String> fields;
}

enum ScanOutcome { pending, clean, rejected }

/// docs/03 stage 3.2 upload pipeline for the profile photo: presign →
/// multipart POST straight to object storage → confirm → wait for the
/// antivirus scan → `PATCH /users/me {avatarFileId}`. Throws [ApiException].
abstract interface class AvatarUploadRepository {
  Future<PresignedUpload> presign({
    required String mime,
    required int sizeBytes,
    required String sha256,
  });

  /// Uploads to storage; [onProgress] gets 0..1. Throws
  /// [UploadCancelledException] once [cancellation] is cancelled.
  Future<void> upload(
    PresignedUpload target,
    Uint8List bytes,
    String mime, {
    void Function(double progress)? onProgress,
    UploadCancellation? cancellation,
  });

  Future<ScanOutcome> confirm(String fileId);

  Future<ScanOutcome> scanStatus(String fileId);

  /// Attaches the clean file as the account avatar; returns fresh `me`.
  Future<CurrentUser> attach(String fileId);
}

class ApiAvatarUploadRepository implements AvatarUploadRepository {
  ApiAvatarUploadRepository({
    required Dio apiDio,
    required Dio storageDio,
    required UsersApiClient users,
  })  : _files = api.FilesClient(apiDio),
        _uploader = StorageUploader.dio(apiDio, storageDio),
        _users = users;

  final api.FilesClient _files;
  final StorageUploader _uploader;
  final UsersApiClient _users;

  @override
  Future<PresignedUpload> presign({
    required String mime,
    required int sizeBytes,
    required String sha256,
  }) async {
    // Owner 2026-10-22 (audit #4 §3): the shared uploader's steps.
    final t = await _uploader.presign(
      purpose: api.FilePurpose.avatar,
      mime: mime,
      sizeBytes: sizeBytes,
      sha256: sha256,
    );
    return PresignedUpload(fileId: t.fileId, url: t.url, fields: t.fields);
  }

  @override
  Future<void> upload(
    PresignedUpload target,
    Uint8List bytes,
    String mime, {
    void Function(double progress)? onProgress,
    UploadCancellation? cancellation,
  }) async {
    if (cancellation?.isCancelled ?? false) {
      throw const UploadCancelledException();
    }
    final token = CancelToken();
    cancellation?.onCancel(token.cancel);
    try {
      await _uploader.put(
        StorageTarget(
          fileId: target.fileId,
          url: target.url,
          fields: target.fields,
        ),
        UploadBody.bytes(bytes),
        mime: mime,
        filename: 'avatar.${mime.split('/').last}',
        cancel: token,
        onProgress: onProgress,
      );
    } on DioException catch (e) {
      if (CancelToken.isCancel(e)) throw const UploadCancelledException();
      rethrow;
    }
  }

  @override
  Future<ScanOutcome> confirm(String fileId) async => _outcome(
        (await guardApiCall(() => _files.confirm(id: fileId))).data.scanStatus,
      );

  @override
  Future<ScanOutcome> scanStatus(String fileId) async => _outcome(
        (await guardApiCall(() => _files.getFilesId(id: fileId)))
            .data
            .scanStatus,
      );

  @override
  Future<CurrentUser> attach(String fileId) async => CurrentUserMapper.fromDto(
        await _users.updateProfile(api.UpdateProfileDto(avatarFileId: fileId)),
      );

  static ScanOutcome _outcome(api.ScanStatus s) => switch (s) {
        api.ScanStatus.clean => ScanOutcome.clean,
        api.ScanStatus.pending => ScanOutcome.pending,
        _ => ScanOutcome.rejected,
      };
}
