// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'registry_test_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RegistryTestResultDto _$RegistryTestResultDtoFromJson(
  Map<String, dynamic> json,
) => RegistryTestResultDto(
  result: RegistryTestResultDtoResult.fromJson(json['result'] as String),
  details: json['details'],
  error: json['error'] as String?,
  testedAt: DateTime.parse(json['testedAt'] as String),
);

Map<String, dynamic> _$RegistryTestResultDtoToJson(
  RegistryTestResultDto instance,
) => <String, dynamic>{
  'result': instance.result.toJson(),
  'details': ?instance.details,
  'error': ?instance.error,
  'testedAt': instance.testedAt.toIso8601String(),
};
