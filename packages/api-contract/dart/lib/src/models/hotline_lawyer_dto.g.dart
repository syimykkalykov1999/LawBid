// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_lawyer_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineLawyerDto _$HotlineLawyerDtoFromJson(Map<String, dynamic> json) =>
    HotlineLawyerDto(
      id: json['id'] as String,
      name: json['name'] as String,
      state: json['state'] as String,
      barNumber: json['barNumber'] as String?,
    );

Map<String, dynamic> _$HotlineLawyerDtoToJson(HotlineLawyerDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'state': instance.state,
      'barNumber': ?instance.barNumber,
    };
