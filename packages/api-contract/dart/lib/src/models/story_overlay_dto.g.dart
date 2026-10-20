// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'story_overlay_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StoryOverlayDto _$StoryOverlayDtoFromJson(Map<String, dynamic> json) =>
    StoryOverlayDto(
      emoji: json['emoji'] as String,
      x: json['x'] as num,
      y: json['y'] as num,
      scale: json['scale'] as num,
      rotation: json['rotation'] as num,
    );

Map<String, dynamic> _$StoryOverlayDtoToJson(StoryOverlayDto instance) =>
    <String, dynamic>{
      'emoji': instance.emoji,
      'x': instance.x,
      'y': instance.y,
      'scale': instance.scale,
      'rotation': instance.rotation,
    };
