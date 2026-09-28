// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'presigned_upload_dto.g.dart';

@JsonSerializable()
class PresignedUploadDto {
  const PresignedUploadDto({required this.url, required this.fields});

  factory PresignedUploadDto.fromJson(Map<String, Object?> json) =>
      _$PresignedUploadDtoFromJson(json);

  /// POST target (multipart/form-data): send every field, then the file as the last field named "file".
  final String url;

  /// Form fields signed by the server (key, policy, signature, Content-Type).
  final Map<String, String> fields;

  Map<String, Object?> toJson() => _$PresignedUploadDtoToJson(this);
}
