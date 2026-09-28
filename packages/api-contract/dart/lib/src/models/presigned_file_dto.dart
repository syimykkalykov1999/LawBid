// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'presigned_upload_dto.dart';

part 'presigned_file_dto.g.dart';

@JsonSerializable()
class PresignedFileDto {
  const PresignedFileDto({
    required this.fileId,
    required this.upload,
    required this.expiresAt,
  });

  factory PresignedFileDto.fromJson(Map<String, Object?> json) =>
      _$PresignedFileDtoFromJson(json);

  /// Id to pass to POST /files/{id}/confirm.
  final String fileId;
  final PresignedUploadDto upload;

  /// The upload link expires at (5 minutes).
  final DateTime expiresAt;

  Map<String, Object?> toJson() => _$PresignedFileDtoToJson(this);
}
