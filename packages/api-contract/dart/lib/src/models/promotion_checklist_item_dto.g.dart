// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion_checklist_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromotionChecklistItemDto _$PromotionChecklistItemDtoFromJson(
  Map<String, dynamic> json,
) => PromotionChecklistItemDto(
  id: json['id'] as String,
  key: json['key'] as String,
  done: json['done'] as bool,
);

Map<String, dynamic> _$PromotionChecklistItemDtoToJson(
  PromotionChecklistItemDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'key': instance.key,
  'done': instance.done,
};
