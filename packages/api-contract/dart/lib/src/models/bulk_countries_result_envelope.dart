// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bulk_countries_result_dto.dart';
import 'response_meta_dto.dart';

part 'bulk_countries_result_envelope.g.dart';

@JsonSerializable()
class BulkCountriesResultEnvelope {
  const BulkCountriesResultEnvelope({required this.data, this.meta});

  factory BulkCountriesResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$BulkCountriesResultEnvelopeFromJson(json);

  final BulkCountriesResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$BulkCountriesResultEnvelopeToJson(this);
}
