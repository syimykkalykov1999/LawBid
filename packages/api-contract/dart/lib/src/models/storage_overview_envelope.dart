// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'storage_overview_dto.dart';

part 'storage_overview_envelope.g.dart';

@JsonSerializable()
class StorageOverviewEnvelope {
  const StorageOverviewEnvelope({required this.data, this.meta});

  factory StorageOverviewEnvelope.fromJson(Map<String, Object?> json) =>
      _$StorageOverviewEnvelopeFromJson(json);

  final StorageOverviewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StorageOverviewEnvelopeToJson(this);
}
