// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'storage_cleanup_result_dto.dart';

part 'storage_cleanup_result_envelope.g.dart';

@JsonSerializable()
class StorageCleanupResultEnvelope {
  const StorageCleanupResultEnvelope({required this.data, this.meta});

  factory StorageCleanupResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$StorageCleanupResultEnvelopeFromJson(json);

  final StorageCleanupResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StorageCleanupResultEnvelopeToJson(this);
}
