// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'presigned_upload_dto_method.dart';

part 'presigned_upload_dto.g.dart';

@JsonSerializable()
class PresignedUploadDto {
  const PresignedUploadDto({
    required this.url,
    required this.fields,
    this.method,
    this.headers,
  });

  factory PresignedUploadDto.fromJson(Map<String, Object?> json) =>
      _$PresignedUploadDtoFromJson(json);

  /// Upload target. With method POST (default): multipart/form-data, send every field, then the file as the last field named "file". With method PUT: send the raw file as the body.
  final String url;

  /// Form fields signed by the server (key, policy, signature, Content-Type). Empty for method PUT.
  final Map<String, String> fields;

  /// HTTP method of the upload. Absent means POST (older servers).
  final PresignedUploadDtoMethod? method;

  /// Headers to send exactly as given with a PUT upload (Content-Type, Cache-Control).
  final Map<String, String>? headers;

  Map<String, Object?> toJson() => _$PresignedUploadDtoToJson(this);
}
