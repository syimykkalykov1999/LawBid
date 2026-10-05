// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bulk_countries_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BulkCountriesResultDto _$BulkCountriesResultDtoFromJson(
  Map<String, dynamic> json,
) => BulkCountriesResultDto(
  changed: (json['changed'] as List<dynamic>).map((e) => e as String).toList(),
  skipped: (json['skipped'] as List<dynamic>).map((e) => e as String).toList(),
);

Map<String, dynamic> _$BulkCountriesResultDtoToJson(
  BulkCountriesResultDto instance,
) => <String, dynamic>{
  'changed': instance.changed,
  'skipped': instance.skipped,
};
