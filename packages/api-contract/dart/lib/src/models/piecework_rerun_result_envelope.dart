// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'piecework_rerun_result_dto.dart';
import 'response_meta_dto.dart';

part 'piecework_rerun_result_envelope.g.dart';

@JsonSerializable()
class PieceworkRerunResultEnvelope {
  const PieceworkRerunResultEnvelope({required this.data, this.meta});

  factory PieceworkRerunResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$PieceworkRerunResultEnvelopeFromJson(json);

  final PieceworkRerunResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PieceworkRerunResultEnvelopeToJson(this);
}
