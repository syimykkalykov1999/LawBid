// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'task_place_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TaskPlaceDto _$TaskPlaceDtoFromJson(Map<String, dynamic> json) => TaskPlaceDto(
  id: json['id'] as String,
  address: json['address'] as String,
  label: json['label'] as String?,
);

Map<String, dynamic> _$TaskPlaceDtoToJson(TaskPlaceDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'label': ?instance.label,
      'address': instance.address,
    };
