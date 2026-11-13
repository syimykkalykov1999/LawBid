// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_purged_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiPurgedDto _$AiPurgedDtoFromJson(Map<String, dynamic> json) => AiPurgedDto(
  items: json['items'] as num,
  runs: json['runs'] as num,
  images: json['images'] as num,
  closedTasks: json['closedTasks'] as num,
  unattached: json['unattached'] as num,
);

Map<String, dynamic> _$AiPurgedDtoToJson(AiPurgedDto instance) =>
    <String, dynamic>{
      'items': instance.items,
      'runs': instance.runs,
      'images': instance.images,
      'closedTasks': instance.closedTasks,
      'unattached': instance.unattached,
    };
