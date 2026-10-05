// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bulk_trust_result_dto.dart';
import 'response_meta_dto.dart';

part 'bulk_trust_result_envelope.g.dart';

@JsonSerializable()
class BulkTrustResultEnvelope {
  const BulkTrustResultEnvelope({required this.data, this.meta});

  factory BulkTrustResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$BulkTrustResultEnvelopeFromJson(json);

  final BulkTrustResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$BulkTrustResultEnvelopeToJson(this);
}
