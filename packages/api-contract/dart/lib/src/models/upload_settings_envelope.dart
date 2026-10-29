// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'upload_settings_dto.dart';

part 'upload_settings_envelope.g.dart';

@JsonSerializable()
class UploadSettingsEnvelope {
  const UploadSettingsEnvelope({
    required this.data,
    this.meta,
  });
  
  factory UploadSettingsEnvelope.fromJson(Map<String, Object?> json) => _$UploadSettingsEnvelopeFromJson(json);
  
  final UploadSettingsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$UploadSettingsEnvelopeToJson(this);
}
