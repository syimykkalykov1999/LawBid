import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';

import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/onboarding/data/current_user_mapper.dart';
import 'package:lawbid/features/onboarding/data/users_api_client.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Max avatar size (docs/03 §9 `files.avatar_max_size_mb` = 5); the server
/// re-checks it in the S3 policy and on confirm.
const kAvatarMaxBytes = 5 * 1024 * 1024;

/// Real image type from the first bytes (docs/03 §4.1: JPEG/PNG/HEIC), or
/// null for anything else. The server re-checks magic bytes on confirm.
String? sniffImageMime(Uint8List bytes) {
  if (bytes.length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF) {
    return 'image/jpeg';
  }
  if (bytes.length >= 8 &&
      bytes[0] == 0x89 &&
      bytes[1] == 0x50 &&
      bytes[2] == 0x4E &&
      bytes[3] == 0x47) {
    return 'image/png';
  }
  if (bytes.length >= 12 && String.fromCharCodes(bytes.sublist(4, 8)) == 'ftyp') {
    final brand = String.fromCharCodes(bytes.sublist(8, 12));
    if (const {'heic', 'heix', 'hevc', 'mif1', 'msf1'}.contains(brand)) return 'image/heic';
  }
  return null;
}

/// A presigned S3 POST (`POST /files/presign`).
class PresignedUpload {
  const PresignedUpload({required this.fileId, required this.url, required this.fields});
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

  /// Uploads to storage; [onProgress] gets 0..1.
  Future<void> upload(
    PresignedUpload target,
    Uint8List bytes,
    String mime, {
    void Function(double progress)? onProgress,
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
        _storage = storageDio,
        _users = users;

  final api.FilesClient _files;
  final Dio _storage;
  final UsersApiClient _users;

  @override
  Future<PresignedUpload> presign({
    required String mime,
    required int sizeBytes,
    required String sha256,
  }) async {
    final dto = (await guardApiCall(
      () => _files.presign(
        body: api.PresignFileDto(
          purpose: api.FilePurpose.avatar,
          mime: mime,
          sizeBytes: sizeBytes,
          sha256: sha256,
        ),
        // Idempotent server-side: a retried presign returns the same link.
        extras: const {RequestFlags.createsResource: true},
      ),
    ))
        .data;
    return PresignedUpload(fileId: dto.fileId, url: dto.upload.url, fields: dto.upload.fields);
  }

  @override
  Future<void> upload(
    PresignedUpload target,
    Uint8List bytes,
    String mime, {
    void Function(double progress)? onProgress,
  }) async {
    final parts = mime.split('/');
    final form = FormData.fromMap({
      ...target.fields,
      // S3 POST policy: the file must be the LAST field.
      'file': MultipartFile.fromBytes(
        bytes,
        filename: 'avatar.${parts.last}',
        contentType: DioMediaType(parts.first, parts.last),
      ),
    });
    try {
      await _storage.post<void>(
        target.url,
        data: form,
        onSendProgress: (sent, total) {
          if (total > 0) onProgress?.call(sent / total);
        },
      );
    } on DioException catch (e) {
      // Storage answers in XML, never our error envelope.
      throw ApiException(
        code: e.response == null ? ApiException.networkErrorCode : ApiErrorCodes.fileNotUploaded,
        message: 'Upload to storage failed.',
        statusCode: e.response?.statusCode,
      );
    }
  }

  @override
  Future<ScanOutcome> confirm(String fileId) async =>
      _outcome((await guardApiCall(() => _files.confirm(id: fileId))).data.scanStatus);

  @override
  Future<ScanOutcome> scanStatus(String fileId) async =>
      _outcome((await guardApiCall(() => _files.getFilesId(id: fileId))).data.scanStatus);

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

/// Lowercase hex SHA-256 the presign requires.
String sha256Hex(Uint8List bytes) => sha256.convert(bytes).toString();
