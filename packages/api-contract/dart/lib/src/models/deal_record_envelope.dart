// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'deal_record_dto.dart';
import 'response_meta_dto.dart';

part 'deal_record_envelope.g.dart';

@JsonSerializable()
class DealRecordEnvelope {
  const DealRecordEnvelope({required this.data, this.meta});

  factory DealRecordEnvelope.fromJson(Map<String, Object?> json) =>
      _$DealRecordEnvelopeFromJson(json);

  final DealRecordDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$DealRecordEnvelopeToJson(this);
}
