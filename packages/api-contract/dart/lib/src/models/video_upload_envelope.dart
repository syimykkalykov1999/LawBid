// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'video_upload_dto.dart';

part 'video_upload_envelope.g.dart';

@JsonSerializable()
class VideoUploadEnvelope {
  const VideoUploadEnvelope({required this.data, this.meta});

  factory VideoUploadEnvelope.fromJson(Map<String, Object?> json) =>
      _$VideoUploadEnvelopeFromJson(json);

  final VideoUploadDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$VideoUploadEnvelopeToJson(this);
}
