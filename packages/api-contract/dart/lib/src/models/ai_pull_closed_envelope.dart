// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_pull_closed_dto.dart';
import 'response_meta_dto.dart';

part 'ai_pull_closed_envelope.g.dart';

@JsonSerializable()
class AiPullClosedEnvelope {
  const AiPullClosedEnvelope({required this.data, this.meta});

  factory AiPullClosedEnvelope.fromJson(Map<String, Object?> json) =>
      _$AiPullClosedEnvelopeFromJson(json);

  final AiPullClosedDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AiPullClosedEnvelopeToJson(this);
}
