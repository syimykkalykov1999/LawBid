// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'story_tray_item_dto.dart';

part 'story_tray_item_list_envelope.g.dart';

@JsonSerializable()
class StoryTrayItemListEnvelope {
  const StoryTrayItemListEnvelope({
    required this.data,
    this.meta,
  });
  
  factory StoryTrayItemListEnvelope.fromJson(Map<String, Object?> json) => _$StoryTrayItemListEnvelopeFromJson(json);
  
  final List<StoryTrayItemDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StoryTrayItemListEnvelopeToJson(this);
}
