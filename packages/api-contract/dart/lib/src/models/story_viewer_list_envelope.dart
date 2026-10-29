// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'story_viewer_dto.dart';

part 'story_viewer_list_envelope.g.dart';

@JsonSerializable()
class StoryViewerListEnvelope {
  const StoryViewerListEnvelope({
    required this.data,
    this.meta,
  });
  
  factory StoryViewerListEnvelope.fromJson(Map<String, Object?> json) => _$StoryViewerListEnvelopeFromJson(json);
  
  final List<StoryViewerDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StoryViewerListEnvelopeToJson(this);
}
