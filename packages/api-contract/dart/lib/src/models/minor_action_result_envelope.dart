// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'minor_action_result_dto.dart';
import 'response_meta_dto.dart';

part 'minor_action_result_envelope.g.dart';

@JsonSerializable()
class MinorActionResultEnvelope {
  const MinorActionResultEnvelope({required this.data, this.meta});

  factory MinorActionResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$MinorActionResultEnvelopeFromJson(json);

  final MinorActionResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$MinorActionResultEnvelopeToJson(this);
}
