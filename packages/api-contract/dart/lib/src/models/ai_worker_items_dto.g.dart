// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_worker_items_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiWorkerItemsDto _$AiWorkerItemsDtoFromJson(Map<String, dynamic> json) =>
    AiWorkerItemsDto(
      items: (json['items'] as List<dynamic>)
          .map((e) => AiWorkerItemDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      nextCursor: json['nextCursor'] as String?,
    );

Map<String, dynamic> _$AiWorkerItemsDtoToJson(AiWorkerItemsDto instance) =>
    <String, dynamic>{
      'items': instance.items.map((e) => e.toJson()).toList(),
      'nextCursor': ?instance.nextCursor,
    };
