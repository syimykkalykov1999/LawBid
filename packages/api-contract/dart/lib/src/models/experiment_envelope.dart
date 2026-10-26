// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'experiment_dto.dart';
import 'response_meta_dto.dart';

part 'experiment_envelope.g.dart';

@JsonSerializable()
class ExperimentEnvelope {
  const ExperimentEnvelope({required this.data, this.meta});

  factory ExperimentEnvelope.fromJson(Map<String, Object?> json) =>
      _$ExperimentEnvelopeFromJson(json);

  final ExperimentDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ExperimentEnvelopeToJson(this);
}
