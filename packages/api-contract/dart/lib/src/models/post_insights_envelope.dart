// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'post_insights_dto.dart';
import 'response_meta_dto.dart';

part 'post_insights_envelope.g.dart';

@JsonSerializable()
class PostInsightsEnvelope {
  const PostInsightsEnvelope({required this.data, this.meta});

  factory PostInsightsEnvelope.fromJson(Map<String, Object?> json) =>
      _$PostInsightsEnvelopeFromJson(json);

  final PostInsightsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PostInsightsEnvelopeToJson(this);
}
