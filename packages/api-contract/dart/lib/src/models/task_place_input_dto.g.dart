// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'task_place_input_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TaskPlaceInputDto _$TaskPlaceInputDtoFromJson(Map<String, dynamic> json) =>
    TaskPlaceInputDto(
      address: json['address'] as String,
      label: json['label'] as String?,
    );

Map<String, dynamic> _$TaskPlaceInputDtoToJson(TaskPlaceInputDto instance) =>
    <String, dynamic>{'label': ?instance.label, 'address': instance.address};
