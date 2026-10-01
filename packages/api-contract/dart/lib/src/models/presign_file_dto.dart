// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'file_purpose.dart';

part 'presign_file_dto.g.dart';

@JsonSerializable()
class PresignFileDto {
  const PresignFileDto({
    required this.purpose,
    required this.mime,
    required this.sizeBytes,
    required this.sha256,
  });

  factory PresignFileDto.fromJson(Map<String, Object?> json) =>
      _$PresignFileDtoFromJson(json);

  final FilePurpose purpose;

  /// One of: image/jpeg, image/png, image/heic, application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, audio/mp4, image/webp, image/gif, application/msword, application/vnd.ms-excel, application/vnd.ms-powerpoint, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.openxmlformats-officedocument.presentationml.presentation, application/vnd.oasis.opendocument.text, application/vnd.oasis.opendocument.spreadsheet, application/vnd.oasis.opendocument.presentation, application/rtf, text/plain, text/csv (allowed set depends on purpose).
  final String mime;

  /// Exact size of the file in bytes.
  final num sizeBytes;

  /// Lowercase hex SHA-256 of the file.
  final String sha256;

  Map<String, Object?> toJson() => _$PresignFileDtoToJson(this);
}
