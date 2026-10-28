// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'deal_record_lookup_dto.dart';
import 'response_meta_dto.dart';

part 'deal_record_lookup_envelope.g.dart';

@JsonSerializable()
class DealRecordLookupEnvelope {
  const DealRecordLookupEnvelope({required this.data, this.meta});

  factory DealRecordLookupEnvelope.fromJson(Map<String, Object?> json) =>
      _$DealRecordLookupEnvelopeFromJson(json);

  final DealRecordLookupDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$DealRecordLookupEnvelopeToJson(this);
}
