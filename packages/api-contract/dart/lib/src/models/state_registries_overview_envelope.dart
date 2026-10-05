// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'state_registries_overview_dto.dart';

part 'state_registries_overview_envelope.g.dart';

@JsonSerializable()
class StateRegistriesOverviewEnvelope {
  const StateRegistriesOverviewEnvelope({required this.data, this.meta});

  factory StateRegistriesOverviewEnvelope.fromJson(Map<String, Object?> json) =>
      _$StateRegistriesOverviewEnvelopeFromJson(json);

  final StateRegistriesOverviewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$StateRegistriesOverviewEnvelopeToJson(this);
}
