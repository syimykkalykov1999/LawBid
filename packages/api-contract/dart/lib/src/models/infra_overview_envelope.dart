// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'infra_overview_dto.dart';
import 'response_meta_dto.dart';

part 'infra_overview_envelope.g.dart';

@JsonSerializable()
class InfraOverviewEnvelope {
  const InfraOverviewEnvelope({required this.data, this.meta});

  factory InfraOverviewEnvelope.fromJson(Map<String, Object?> json) =>
      _$InfraOverviewEnvelopeFromJson(json);

  final InfraOverviewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$InfraOverviewEnvelopeToJson(this);
}
