// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'treasury_overview_dto.dart';

part 'treasury_overview_envelope.g.dart';

@JsonSerializable()
class TreasuryOverviewEnvelope {
  const TreasuryOverviewEnvelope({required this.data, this.meta});

  factory TreasuryOverviewEnvelope.fromJson(Map<String, Object?> json) =>
      _$TreasuryOverviewEnvelopeFromJson(json);

  final TreasuryOverviewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$TreasuryOverviewEnvelopeToJson(this);
}
