// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'recompute_all_result_dto.dart';
import 'response_meta_dto.dart';

part 'recompute_all_result_envelope.g.dart';

@JsonSerializable()
class RecomputeAllResultEnvelope {
  const RecomputeAllResultEnvelope({required this.data, this.meta});

  factory RecomputeAllResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$RecomputeAllResultEnvelopeFromJson(json);

  final RecomputeAllResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$RecomputeAllResultEnvelopeToJson(this);
}
