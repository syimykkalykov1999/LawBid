// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'sanction_result_dto.dart';

part 'sanction_result_envelope.g.dart';

@JsonSerializable()
class SanctionResultEnvelope {
  const SanctionResultEnvelope({required this.data, this.meta});

  factory SanctionResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$SanctionResultEnvelopeFromJson(json);

  final SanctionResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SanctionResultEnvelopeToJson(this);
}
