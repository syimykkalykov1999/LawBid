// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'test_state_registry_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TestStateRegistryDto _$TestStateRegistryDtoFromJson(
  Map<String, dynamic> json,
) => TestStateRegistryDto(
  barNumber: json['barNumber'] as String,
  firstName: json['firstName'] as String?,
  lastName: json['lastName'] as String?,
);

Map<String, dynamic> _$TestStateRegistryDtoToJson(
  TestStateRegistryDto instance,
) => <String, dynamic>{
  'barNumber': instance.barNumber,
  'firstName': ?instance.firstName,
  'lastName': ?instance.lastName,
};
