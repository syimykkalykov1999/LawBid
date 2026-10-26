// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'erasure_record_dto.dart';
import 'response_meta_dto.dart';

part 'erasure_record_envelope.g.dart';

@JsonSerializable()
class ErasureRecordEnvelope {
  const ErasureRecordEnvelope({required this.data, this.meta});

  factory ErasureRecordEnvelope.fromJson(Map<String, Object?> json) =>
      _$ErasureRecordEnvelopeFromJson(json);

  final ErasureRecordDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ErasureRecordEnvelopeToJson(this);
}
