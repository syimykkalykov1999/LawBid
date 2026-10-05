// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'storage_settings_dto.dart';

part 'storage_settings_envelope.g.dart';

@JsonSerializable()
class StorageSettingsEnvelope {
  const StorageSettingsEnvelope({required this.data, this.meta});

  factory StorageSettingsEnvelope.fromJson(Map<String, Object?> json) =>
      _$StorageSettingsEnvelopeFromJson(json);

  final StorageSettingsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StorageSettingsEnvelopeToJson(this);
}
