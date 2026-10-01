// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'integrations_overview_dto.dart';
import 'response_meta_dto.dart';

part 'integrations_overview_envelope.g.dart';

@JsonSerializable()
class IntegrationsOverviewEnvelope {
  const IntegrationsOverviewEnvelope({required this.data, this.meta});

  factory IntegrationsOverviewEnvelope.fromJson(Map<String, Object?> json) =>
      _$IntegrationsOverviewEnvelopeFromJson(json);

  final IntegrationsOverviewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$IntegrationsOverviewEnvelopeToJson(this);
}
