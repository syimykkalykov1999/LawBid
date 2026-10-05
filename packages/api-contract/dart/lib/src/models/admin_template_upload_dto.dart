// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_template_upload_dto_mime.dart';

part 'admin_template_upload_dto.g.dart';

@JsonSerializable()
class AdminTemplateUploadDto {
  const AdminTemplateUploadDto({
    required this.mime,
    required this.sizeBytes,
    required this.sha256,
  });

  factory AdminTemplateUploadDto.fromJson(Map<String, Object?> json) =>
      _$AdminTemplateUploadDtoFromJson(json);

  final AdminTemplateUploadDtoMime mime;

  /// Bytes; the `files.document_template_max_size_mb` setting applies.
  final num sizeBytes;
  final String sha256;

  Map<String, Object?> toJson() => _$AdminTemplateUploadDtoToJson(this);
}
