// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'saved_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SavedItemDto _$SavedItemDtoFromJson(Map<String, dynamic> json) => SavedItemDto(
  itemType: SavedItemType.fromJson(json['itemType'] as String),
  itemId: json['itemId'] as String,
);

Map<String, dynamic> _$SavedItemDtoToJson(SavedItemDto instance) =>
    <String, dynamic>{
      'itemType': instance.itemType.toJson(),
      'itemId': instance.itemId,
    };
