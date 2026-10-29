// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'story_dto.dart';

part 'story_list_envelope.g.dart';

@JsonSerializable()
class StoryListEnvelope {
  const StoryListEnvelope({
    required this.data,
    this.meta,
  });
  
  factory StoryListEnvelope.fromJson(Map<String, Object?> json) => _$StoryListEnvelopeFromJson(json);
  
  final List<StoryDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StoryListEnvelopeToJson(this);
}
