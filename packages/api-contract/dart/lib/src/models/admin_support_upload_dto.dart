// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_support_upload_dto_mime.dart';

part 'admin_support_upload_dto.g.dart';

@JsonSerializable()
class AdminSupportUploadDto {
  const AdminSupportUploadDto({
    required this.mime,
    required this.sizeBytes,
    required this.sha256,
  });

  factory AdminSupportUploadDto.fromJson(Map<String, Object?> json) =>
      _$AdminSupportUploadDtoFromJson(json);

  final AdminSupportUploadDtoMime mime;
  final num sizeBytes;

  /// Lowercase hex SHA-256 of the file.
  final String sha256;

  Map<String, Object?> toJson() => _$AdminSupportUploadDtoToJson(this);
}
