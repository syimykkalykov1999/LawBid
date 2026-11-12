// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_pull_merged_dto.dart';
import 'response_meta_dto.dart';

part 'ai_pull_merged_envelope.g.dart';

@JsonSerializable()
class AiPullMergedEnvelope {
  const AiPullMergedEnvelope({required this.data, this.meta});

  factory AiPullMergedEnvelope.fromJson(Map<String, Object?> json) =>
      _$AiPullMergedEnvelopeFromJson(json);

  final AiPullMergedDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AiPullMergedEnvelopeToJson(this);
}
