// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'story_dto.dart';

part 'story_envelope.g.dart';

@JsonSerializable()
class StoryEnvelope {
  const StoryEnvelope({
    required this.data,
    this.meta,
  });
  
  factory StoryEnvelope.fromJson(Map<String, Object?> json) => _$StoryEnvelopeFromJson(json);
  
  final StoryDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StoryEnvelopeToJson(this);
}
